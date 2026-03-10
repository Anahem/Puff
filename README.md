# Puff

A self-hosted group joint and expense tracker for your squad. Tracks who smoked what, splits costs fairly, and handles guests — all running locally on your machine.

## Features

- **Member joint counters** — track each person's joint tally with ¼-joint precision; increment, decrement, or bulk-add/subtract
- **Shared joint logging** — log a joint smoked by multiple people and the cost is split equally (each gets 1/N)
- **Price per joint** — automatically calculated from total expenses ÷ total joints
- **Live balances** — each member's balance updates in real time: `joints × £/joint − amount paid`
- **Expense tracker** — log expenses by category (ganja, papers, misc) with optional memo; tracks who paid
- **Guest member** — built-in guest slot for visitors; their joints don't count against the squad but their balance is tracked
- **Guest socialisation** — split the guest's outstanding balance across regular members at custom percentages with one click
- **Session history** — close a session to archive a full snapshot; see actual (non-guest) vs total joints and spend
- **Activity log** — every joint, expense, and balance change is recorded with timestamps
- **Member history** — all-time joint and spend totals per person across every archived session
- **Single shared password** — one password for the whole squad; set it on first launch via `/setup`

## Requirements

- [Node.js](https://nodejs.org) **v22 or newer** (uses the built-in SQLite module)
- Windows, macOS, or Linux

## Quick Start

**1. Clone the repo**
```bash
git clone https://github.com/Anahem/Puff.git
cd Puff
```

**2. Install dependencies**
```bash
npm install
```

**3. Create your config file**
```bash
cp .env.example .env
```
Then open `.env` and set at minimum:
```
SESSION_SECRET=any-long-random-string-you-make-up
```

**4. Start the server**

- **Windows:** double-click `start.bat`
- **Mac / Linux:**
  ```bash
  npm run dev
  ```

**5. Open your browser**

Go to `http://localhost:3000`

On first run you'll be taken to a setup page to create your shared password. After that, log in and start tracking.

## Configuration (`.env`)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Port to run on (default: `3000`) |
| `SESSION_SECRET` | Yes | Any long random string — keeps sessions secure |
| `PASSWORD_HASH` | Auto | Set automatically by the `/setup` page on first launch |

## How It Works

### Joints & Balances

Each member has a joint counter. As you log joints, the app calculates a **price per joint** (£/joint) from your total expenses divided by total joints smoked. Each member's balance is then:

```
balance = joints × (£/joint) − amount they've paid in expenses
```

A positive balance means they owe the group; negative means the group owes them.

### Sessions

A **session** represents one smoking period (a night out, a week, etc.). When you're done, hit **Close Session** — this archives a full snapshot of everyone's joints, expenses, and balances, then resets everything to zero for the next session. You can view all past sessions under **History**.

### Guest Member

The app has a built-in **Guest** slot for visitors. Guests get their joints tracked normally but their expenses appear separately. When ready to settle up, use the **↔ button** on the guest card to split the guest's outstanding balance across regular members at any percentage split you choose.

### Expenses

Log what was spent and who paid. Categories: **ganja**, **papers**, **misc**. The total across all expenses feeds the £/joint calculation automatically.

## Accessing from Other Devices

To use the app from your phone or other devices on the same network, find your PC's local IP address and visit `http://192.168.x.x:3000`. For remote access from anywhere, install [Tailscale](https://tailscale.com) on your PC — your squad can reach the app at your Tailscale IP.

## Data

All data is stored locally in the `data/` folder (excluded from git):

| Path | Contents |
|---|---|
| `data/puff.db` | All members, joints, expenses, sessions |
| `data/sessions.db` | Login sessions |

**To back up:** copy `data/puff.db` somewhere safe.
**To restore:** stop the server, replace `data/puff.db`, restart.

## Docker

```bash
docker-compose up -d
```

The `data/` directory is mounted as a volume so your database persists across container restarts.

## Tech Stack

- **Runtime:** Node.js 22+ with `node:sqlite` (no external DB driver)
- **Server:** Express
- **Templates:** EJS
- **Database:** SQLite (via Node.js built-in)
- **Styling:** Vanilla CSS (dark theme)
