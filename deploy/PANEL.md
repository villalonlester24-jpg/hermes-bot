# Deploying Hermes to a Discord bot-hosting panel

These steps work on any Pterodactyl-style panel (or similar). Exact menu names vary per panel.

---

# GitHub-based host

1. **Rotate the bot token first** (it was shared publicly in chat): Developer Portal -> Bot -> Reset Token.
2. **Log in to GitHub CLI** (one time):
   ```
   gh auth login
   ```
3. **Create a private repo and push** (run in `hermes-bot\`):
   ```
   git init
   git add .
   git commit -m "Hermes Discord voice agent"
   gh repo create hermes-bot --private --source=. --remote=origin --push
   ```
4. **In the host dashboard**, connect that repo, then set:
   - **Runtime/Node version:** 22 (also pinned via `.nvmrc` and `package.json` `engines`)
   - **Build command:** `npm install --omit=dev` (or leave blank if auto)
   - **Start command:** `node src/index.js` (or `npm start`)
   - **Environment variables/secrets:** `DISCORD_TOKEN`, and optionally `VOICE_CHANNEL_ID`, `AUTO_JOIN`, `LEAVE_WHEN_EMPTY`, `GREETING`
5. **Never commit `.env`** - it is gitignored. Put values in the host's secrets instead.
6. **Voice requires outbound UDP.** If the host is a serverless/sleeping platform, the bot will join but be silent - switch to a panel/VPS that allows UDP.

---

## 1. Create the server
- Node.js egg/runtime.
- **Node 22** if the panel offers a version picker. If it only offers 18/20, continue anyway and watch the console:
  - A `EBADENGINE` warning is fine.
  - If the bot crashes on startup, the panel is too old -> use a panel with Node 22.

## 2. Environment variables (recommended over a .env file)
In the panel's Startup / Environment tab, add:
```
DISCORD_TOKEN=<bot token>
VOICE_CHANNEL_ID=<optional channel id to pin 24/7>
AUTO_JOIN=true
LEAVE_WHEN_EMPTY=false
GREETING=Welcome, {name}!
TTS_PROVIDER=edge
TTS_VOICE=en-PH-RosaNeural
```
The code reads `process.env`, so no `.env` file is required. (`dotenv` only fills in keys that are missing.)

## 3. Upload the code
From Windows, in `hermes-bot\`:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\pack.ps1
```
This creates `hermes-panel.zip` with `src\`, `package.json`, `package-lock.json`.
Add `-IncludeEnv` only if you are not using the panel's env vars and the destination is private:
```powershell
powershell -ExecutionPolicy Bypass -File deploy\pack.ps1 -IncludeEnv
```
Upload the zip to the panel's file manager and **unarchive** it (or upload the same files over SFTP / commit them to a private repo and use Git import).

## 4. Install + start
- Install dependencies, using the panel console (or its "Install" action):
```
npm install --omit=dev
```
- Set the **startup command** to:
```
node src/index.js
```
- Start the server.

## 5. Verify
Watch the console. Success looks like:
```
Logged in as Darkinz - Hermes Agent#xxxx
[config] autoJoin=true leaveWhenEmpty=false pinned=...
[voice] joining: <server> / <channel>
[voice] connected: <server> / <channel>
```
Then join a voice channel in Discord - Hermes should speak the greeting.

## 6. Stop the Windows copy
Only one voice session per bot token per server. After the panel is running, on your PC run:
```powershell
Remove-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'HermesVoiceAgent' -ErrorAction SilentlyContinue
Remove-Item (Join-Path ([Environment]::GetFolderPath('Startup')) 'Hermes Voice Agent.lnk') -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'hermes-loop|src\\index.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## Troubleshooting
- **`Missing DISCORD_TOKEN`** -> env var not set, or `.env` not uploaded, or wrong working directory.
- **Bot logs in but never says anything** -> the panel likely blocks outbound UDP. Voice needs UDP; try another panel.
- **Crash mentioning `@snazzah/davey` / `libc` / `.node`** -> the container is Alpine (musl); pick a Debian/glibc Node image.
- **`ffmpeg` errors** -> `ffmpeg-static` failed to download at install. Re-run `npm install`, or confirm the image ships `ffmpeg`.
- **Bot disconnects after a while** -> panel sleeps free apps; check for an idle/sleep policy or a renewal requirement.
- **`/join` `/leave` `/status` commands** -> work if the panel injects no extra restrictions; they are registered per guild on startup.
