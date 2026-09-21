# Darkinz Discord Hermes Voice Agent

> Welcomes members by name in any Discord voice call

![Node](https://img.shields.io/badge/node-%3E%3D22-3c873a?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-discord-5865F2?logo=discord&logoColor=white)

Hermes sits in a Discord voice channel and, every time someone joins the call, says a friendly hello using their name. Invite it to as many servers as you like - it works out the servers and voice channels on its own.

<!-- Drop a screenshot or GIF at docs/screenshot.png so it shows up here. -->
![Hermes greeting a member](docs/screenshot.png)

## Features
- Greets each member by name the moment they join a voice channel
- Works in any server it is invited to (auto-discovers servers and voice channels)
- Optional 24/7 mode - pin one channel and stay there
- Slash commands to join, leave, and check status
- Reconnects automatically if the connection drops
- No privileged intents and no API keys needed

## How it works
1. Hermes connects to Discord with the Guilds and Voice States intents.
2. It watches voice-state updates. When a non-bot member enters a voice channel, it joins that channel and speaks a greeting.
3. The greeting is turned into speech and played into the call through `@discordjs/voice` (ffmpeg is bundled via `ffmpeg-static`).
4. Servers and voice channels it sees are recorded in `data/registry.json`.
5. If a `VOICE_CHANNEL_ID` is set, it also parks in that channel 24/7.

## Quick start (Windows)
Requires Node.js 22+.

1. Create a Discord application and bot, then invite it with **View Channels**, **Connect**, and **Speak**. No privileged intents are required.
2. Create a `.env` file in the project root:
   ```
   DISCORD_TOKEN=your-bot-token
   VOICE_CHANNEL_ID=optional-channel-id-to-pin
   AUTO_JOIN=true
   LEAVE_WHEN_EMPTY=false
   GREETING=Welcome, {name}!
   ```
3. Install and run:
   ```
   npm install
   npm start
   ```
4. To keep it running on Windows, use `hermes-loop.bat` (restarts it if it crashes) and `hermes-service.vbs` to launch it hidden.

## Deploy on Railway
1. Push this repository to GitHub and create a Railway project from it.
2. Add these **Variables**: `DISCORD_TOKEN`, and optionally `VOICE_CHANNEL_ID`, `AUTO_JOIN`, `LEAVE_WHEN_EMPTY`, `GREETING`.
3. `railway.json` already sets the start command (`node src/index.js`) and restart policy.

## Slash commands
| Command | What it does |
| --- | --- |
| `/join` | Hermes joins the voice channel you are currently in |
| `/leave` | Hermes disconnects from this server's voice channel |
| `/status` | Shows which channel Hermes is connected to |

## Configuration
| Variable | Default | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | - | Bot token (required) |
| `VOICE_CHANNEL_ID` | none | Channel to sit in 24/7; leave blank for auto-join only |
| `AUTO_JOIN` | `true` | Join and greet in any server |
| `LEAVE_WHEN_EMPTY` | `false` | Leave a channel once everyone else has left |
| `GREETING` | `Welcome, {name}!` | Greeting text; `{name}` becomes the member's display name |

## License
MIT - see [LICENSE](LICENSE).

## Contact
Email: your-email@example.com

Built by [villalonlester24-jpg](https://github.com/villalonlester24-jpg).
