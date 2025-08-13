import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import TronWeb from 'tronweb'
import cron from 'node-cron'
import { Pool } from 'pg'
import rateLimit from 'express-rate-limit'
import { stringify } from 'csv-stringify/sync'
import crypto from 'crypto'

const {
  TRON_PK,
  USDT_CONTRACT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  TRON_FULL_NODE = 'https://api.trongrid.io',
  TRON_SOLIDITY_NODE = 'https://api.trongrid.io',
  TRON_EVENT_SERVER = 'https://api.trongrid.io',
  MIN_WITHDRAW = '10',
  FEE_PERCENT = '5',
  PAYDAY_CRON = '0 10 * * 1',
  BATCH_MAX = '100',
  MIN_TRX_FOR_FEES = '20',
  CONFIRMATIONS_REQUIRED = '1',
  PORT = '4000'
} = process.env

const app = express()
app.use(cors())
app.use(express.json())

// --- Rate limit login ---
const loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 20 })
app.use('/api/login', loginLimiter)

// --- PG ---
const pool = new Pool()

async function q(sql, params){ const r = await pool.query(sql, params); return r.rows }
async function getConfig(key, def){ const r = await q('SELECT value FROM config WHERE key=$1',[key]); return r[0]?.value ?? def }

// --- TronWeb ---
if (!TRON_PK) console.warn('[WARN] TRON_PK no está definido')
const tronWeb = new TronWeb(TRON_FULL_NODE, TRON_SOLIDITY_NODE, TRON_EVENT_SERVER, TRON_PK)

// --- Helpers ---
const nowISO = ()=> new Date().toISOString()
const netAmount = (amount, feePct)=> Math.round((Number(amount) * (1 - feePct/100)) * 100) / 100
async function sendUsdtTrc20(toAddress, amountUSDT){
  const amount = Math.round(Number(amountUSDT) * 1e6)
  const contract = await tronWeb.contract().at(USDT_CONTRACT)
  const tx = await contract.transfer(toAddress, amount).send({ feeLimit: 10_000_000 })
  return tx
}
async function getBalances(addr){
  // simple approach via TronWeb (USDT balance requires contract call)
  const trxSun = await tronWeb.trx.getBalance(addr)
  let usdt = 0
  try{
    const contract = await tronWeb.contract().at(USDT_CONTRACT)
    const bal = await contract.balanceOf(addr).call()
    usdt = Number(bal.toString())/1e6
  }catch(e){}
  return { usdt, trx: trxSun/1e6 }
}
async function audit(admin, action, detail){
  await q('INSERT INTO audit_log(admin, action, detail) VALUES($1,$2,$3)', [admin||'', action, detail||''])
}

// --- Auth (simplificado con email + password hash sha256 para demo) ---
app.post('/api/register', async (req,res)=>{
  const { name, email, password='' } = req.body||{}
  if(!email) return res.json({ ok:false, error:'email requerido' })
  const hash = crypto.createHash('sha256').update(password).digest('hex')
  await q('INSERT INTO users(name,email,password_hash,verified) VALUES($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING', [name||'', email, hash, true])
  res.json({ ok:true })
})
app.post('/api/login', async (req,res)=>{
  const { email, password='' } = req.body||{}
  const hash = crypto.createHash('sha256').update(password).digest('hex')
  const r = await q('SELECT id,email,is_admin FROM users WHERE email=$1 AND password_hash=$2', [email, hash])
  res.json({ ok: !!r[0], user: r[0]||null })
})

// --- State (demo) ---
app.get('/api/health', (req,res)=> res.json({ ok:true, ts: Date.now() }))
app.get('/api/state', async (req,res)=>{
  const { email } = req.query
  const u = (await q('SELECT id FROM users WHERE email=$1',[email]))[0]
  if(!u) return res.json({ ok:false, error:'no_user' })
  const tree = {}; for (let i=1;i<=12;i++) tree[i] = i<=3 ? Math.pow(2, i-1) : 0
  res.json({ ok:true, tree })
})

// --- Withdrawals ---
app.post('/admin/withdrawals/request', async (req,res)=>{
  const { email, amount, wallet } = req.body||{}
  if(!email || !amount || !wallet) return res.json({ ok:false, error:'faltan campos' })
  const u = (await q('SELECT id FROM users WHERE email=$1',[email]))[0]
  const userId = u?.id || (await q('INSERT INTO users(name,email,verified) VALUES($1,$2,$3) RETURNING id',[email.split('@')[0], email, true]))[0].id
  const feePercent = Number(await getConfig('feePercent', FEE_PERCENT))
  const net = netAmount(amount, feePercent)
  const r = await q(`INSERT INTO withdrawals(user_id,amount_requested,fee_percent,amount_net,wallet,status,created_at)
                     VALUES($1,$2,$3,$4,$5,'solicitado',now())
                     RETURNING *`, [userId, Number(amount), feePercent, net, wallet])
  res.json({ ok:true, item:r[0] })
})

app.post('/admin/withdrawals/:id/approve', async (req,res)=>{
  const { id } = req.params
  // schedule next monday UTC
  const d = new Date(); const day = d.getUTCDay(); const delta = (1 - day + 7) % 7; const nextMon = new Date(d.getTime()+delta*24*3600*1000)
  const ymd = nextMon.toISOString().slice(0,10)
  const r = await q(`UPDATE withdrawals SET status='aprobado', scheduled_for=$2, updated_at=now() WHERE id=$1 RETURNING *`, [id, ymd])
  await audit('admin','approve_withdrawal',`id=${id} scheduled_for=${ymd}`)
  res.json({ ok: !!r[0], item:r[0]||null })
})

// --- Config ---
app.get('/admin/config', async (req,res)=>{
  const rows = await q('SELECT key, value FROM config ORDER BY key', [])
  res.json({ ok:true, config: Object.fromEntries(rows.map(r=>[r.key,r.value])) })
})
app.post('/admin/config', async (req,res)=>{
  for(const [k,v] of Object.entries(req.body||{})){
    await q(`INSERT INTO config(key,value) VALUES($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [k, String(v)])
  }
  await audit('admin','update_config', JSON.stringify(req.body))
  res.json({ ok:true })
})

// --- Exports ---
app.get('/admin/export/users.csv', async (req,res)=>{
  const rows = await q('SELECT id,name,email,is_admin,verified,created_at FROM users ORDER BY id DESC', [])
  const csv = stringify(rows, { header:true })
  res.setHeader('Content-Type','text/csv'); res.send(csv)
})
app.get('/admin/export/withdrawals.csv', async (req,res)=>{
  const rows = await q('SELECT * FROM withdrawals ORDER BY id DESC', [])
  const csv = stringify(rows, { header:true })
  res.setHeader('Content-Type','text/csv'); res.send(csv)
})

// --- Audit view ---
app.get('/admin/audit', async (req,res)=>{
  const limit = Math.min(Number(req.query.limit||100), 500)
  const rows = await q('SELECT admin, action, detail, ts FROM audit_log ORDER BY id DESC LIMIT $1', [limit])
  res.json({ ok:true, items: rows })
})

// --- Cron payouts (hardened) ---
let scheduledTask = null
function scheduleCron(expr){
  if(scheduledTask) scheduledTask.stop()
  scheduledTask = cron.schedule(expr, ()=> runPayout().catch(e=>console.error('cron error', e)))
}
scheduleCron(PAYDAY_CRON)

async function runPayout(){
  const today = new Date().toISOString().slice(0,10)
  const batchMax = Number(await getConfig('batchMax', BATCH_MAX))
  const minTrx = Number(await getConfig('minTrxForFees', MIN_TRX_FOR_FEES))
  const feePercent = Number(await getConfig('feePercent', FEE_PERCENT))
  // pick approved for today
  const items = await q(`SELECT w.*, u.email FROM withdrawals w JOIN users u ON u.id=w.user_id
                         WHERE w.status='aprobado' AND w.scheduled_for=$1
                         ORDER BY w.id ASC LIMIT $2`, [today, batchMax])
  if(!items.length) return
  const hot = tronWeb.address.fromPrivateKey(TRON_PK)
  const bal = await getBalances(hot)
  if(bal.trx < minTrx) throw new Error('TRX para fees insuficiente')
  const totalNet = items.reduce((a,w)=>a+Number(w.amount_net),0)
  if(bal.usdt < totalNet) throw new Error('USDT insuficiente en hot wallet')

  for(const w of items){
    try{
      await q('UPDATE withdrawals SET status=$2, updated_at=now() WHERE id=$1 AND status=$3', [w.id, 'en_proceso', 'aprobado'])
      const tx = await sendUsdtTrc20(w.wallet, w.amount_net)
      await q('UPDATE withdrawals SET status=$2, tx_hash=$3, updated_at=now() WHERE id=$1', [w.id, 'pagado', tx])
      await audit('cron','payout_success', `wid=${w.id} tx=${tx}`)
    }catch(err){
      await q('UPDATE withdrawals SET status=$2, updated_at=now() WHERE id=$1', [w.id, 'fallido'])
      await audit('cron','payout_fail', `wid=${w.id} err=${String(err?.message||err)}`)
    }
  }
}

// Live change cron via config
app.post('/admin/cron/apply', async (req,res)=>{
  const { expr } = req.body||{}
  if(!expr) return res.json({ ok:false, error:'expr requerido' })
  await q(`INSERT INTO config(key,value) VALUES('paydayCron',$1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [expr])
  scheduleCron(expr)
  await audit('admin','update_cron', expr)
  res.json({ ok:true })
})

app.listen(Number(PORT), ()=> console.log('Backend on', PORT))
