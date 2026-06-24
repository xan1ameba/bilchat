// ============================================================
//  PASTE YOUR LIVEKIT CREDENTIALS BELOW
// ============================================================
const LIVEKIT_URL    = 'wss://bilchat-l6i6hh1z.livekit.cloud'   // <-- paste here
const LIVEKIT_KEY    = 'APIakxJFSpbGwRs'                        // <-- paste here
const LIVEKIT_SECRET = 'tL6Ie1nD2E4MnnMdYONLGjMSZfztiPOlRVANEu8Qz8V'                     // <-- paste here
// ============================================================

const express = require('express')
const { AccessToken } = require('livekit-server-sdk')
const path = require('path')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(path.join(__dirname)))

// --- Matchmaking queue ---
// Each entry: { id, user, res (for long-poll) }
const queue = []

function generateId() {
  return Math.random().toString(36).slice(2, 10)
}

function generateRoomName() {
  return 'room-' + Math.random().toString(36).slice(2, 10)
}

// Join the queue and wait (long-poll — hangs until matched or timeout)
app.post('/api/queue', (req, res) => {
  const user = req.body
  const id   = generateId()

  // If someone is already waiting, match immediately
  if (queue.length > 0) {
    const partner = queue.shift()
    const room    = generateRoomName()

    // Respond to the waiting person
    partner.res.json({ matched: true, room, partnerId: id, partnerUser: user })

    // Respond to the new person right away
    return res.json({ matched: true, room, partnerId: partner.id, partnerUser: partner.user })
  }

  // Nobody waiting — add to queue and hold the connection open
  const entry = { id, user, res }
  queue.push(entry)

  // Timeout after 30s if no match found
  const timeout = setTimeout(() => {
    const idx = queue.indexOf(entry)
    if (idx !== -1) {
      queue.splice(idx, 1)
      res.json({ matched: false })
    }
  }, 30000)

  // Clean up timeout if client disconnects
  req.on('close', () => {
    clearTimeout(timeout)
    const idx = queue.indexOf(entry)
    if (idx !== -1) queue.splice(idx, 1)
  })
})

// Leave the queue (user pressed back/cancel)
app.post('/api/queue/leave', (req, res) => {
  const { id } = req.body
  const idx = queue.findIndex(e => e.id === id)
  if (idx !== -1) {
    queue[idx].res.json({ matched: false, cancelled: true })
    queue.splice(idx, 1)
  }
  res.json({ ok: true })
})

// Generate a LiveKit token
app.get('/api/token', async (req, res) => {
  const { room, identity, name } = req.query
  if (!room || !identity) return res.status(400).json({ error: 'room and identity required' })

  const token = new AccessToken(LIVEKIT_KEY, LIVEKIT_SECRET, {
    identity,
    name: name || identity,
  })
  token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true })

  res.json({ token: await token.toJwt(), url: LIVEKIT_URL })
})

app.listen(PORT, () => {
  console.log(`\n  BilChat server running at http://localhost:${PORT}\n`)
})
