# TURBORUSH ONLINE

A working 3D browser racing game built with Three.js, Vite, Node.js, Express, and Socket.IO.

The garage contains three original low-poly models inspired by the **Toyota Supra MK IV**, **BMW M4**, and **Bugatti Chiron**. Each has different bodywork, lights, grille, wheels, tuning, and nitro capacity. These are procedural interpretations, not official manufacturer assets or accurate vehicle simulations. Displayed performance figures are fictional arcade tuning.

## Start playing

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. One command runs both the frontend and multiplayer backend, with hot reload for frontend changes. Restart the server after editing files under `server/` or `shared/`.

- Select a car in the garage, then press **Quick Race** to race three explicitly labeled AI drivers.
- Select **Race Online** to create or join a private room. All drivers must mark themselves ready. The host starts the race with 2–8 players.
- Drag the showroom to rotate the car. Paint swatches are garage previews; races use signature colors.

## Controls

| Action | Desktop |
| --- | --- |
| Accelerate | W / Up arrow |
| Brake, then reverse | S / Down arrow |
| Steer | A, D / Left, Right arrows |
| Nitro | Space |
| Drift | Shift |
| Recover to track | R |
| Cycle chase / far chase / hood camera | C |
| Pause or race menu | Escape |

Touch devices receive steering buttons, gas, brake, drift, and nitro controls. Multiple fingers are supported simultaneously. Landscape orientation is recommended. The on-screen pause button includes a car reset action.

Quick Race pauses in its menu and when its tab becomes hidden. Online races keep running while a menu is open or a driver switches away; abandoned inputs expire after 500 ms.

## Race rules

- Pinecrest Circuit has a marked starting line, barriers, 12 checkpoint gates, forest scenery, and a city backdrop.
- Cars have solid, orientation-aware collision boxes. Bumper and side impacts transfer momentum, and compact groups push apart. Contact resolution runs in both Quick Race and the authoritative multiplayer simulation.
- Complete every checkpoint in order and finish three laps. Driving backward or skipping a checkpoint does not earn a lap.
- Nitro recharges slowly, faster during drifting, and from glowing pickups. Pickups have a per-driver cooldown.
- Steering becomes less sensitive at high speed. Hold Shift while turning to slide; release it to regain grip gradually, or steer the opposite way to correct the slide.
- The HUD shows lap, position, live minimap, ordered leaderboard, speed, nitro, and race time.
- Results include total time, best lap, chosen car, and the local driver's nitro usage. Quick Race can restart immediately.
- Online racers have 90 seconds to finish after the first finisher, with a 15-minute overall race limit. Unfinished drivers are marked DNF. The host then returns everyone to the lobby for another race.

## Test two players locally

1. Keep the server running.
2. Open `http://localhost:3000` in two independently opened tabs or two browsers. Do not use Duplicate Tab, which may copy the session's reconnect identity.
3. Create a room as one name. Join from the other tab with another name and the displayed five-character code.
4. Choose cars, ready both drivers, and start from the host.
5. Keep both windows visible if you want to watch both views; browsers throttle background rendering.

Online mode uses real Socket.IO clients. AI drivers appear only in Quick Race.

## Play on a phone over Wi-Fi

1. Connect the computer and phone to the same trusted Wi-Fi network.
2. On Windows, run `ipconfig` and find the computer's Wi-Fi IPv4 address, for example `192.168.1.20`.
3. Open `http://192.168.1.20:3000` on the phone. `localhost` on the phone refers to the phone itself.
4. If Windows prompts, allow Node.js on your private network. Guest-network isolation or firewall rules can prevent a connection.
5. Create/join the same room and race. The server listens on all interfaces by default.

No firewall changes are made by this project. Actual phone hardware and cross-network internet play still require testing on the intended devices and hosting environment.

## Build and run production

```sh
npm run build
npm start
```

Production serves the built frontend and Socket.IO from the same Node server at port 3000. Optionally copy `.env.example` to `.env` and set `PORT` and `HOST`. Hosting-platform environment variables also work.

For an internet deployment:

1. Put the project on a Node-capable host with a long-running process and WebSocket support.
2. Use `npm ci --include=dev && npm run build` as the build command and `npm start` as the start command.
3. Set the host's required `PORT` environment variable and keep `HOST=0.0.0.0`.
4. Route HTTPS and `/socket.io/` WebSocket upgrades to the same service.
5. Share the resulting HTTPS URL with the players. A room code works only among clients connected to the same server.

Deploying only `dist/` to static hosting is insufficient for online play. This version keeps rooms in memory in one process: a restart clears rooms, and multiple replicas need a shared room store and networking adapter before use. No hosting deployment or paid service has been configured.

## Architecture

```text
client/
  index.html                 Garage, menus, race HUD, touch controls
  src/
    main.js                  UI and race lifecycle
    cars/CarModel.js          Three distinct procedural 3D car models
    scene/World.js            Renderer, showroom, circuit, follow camera
    controls/Controls.js      Keyboard and multitouch input
    audio/Audio.js            Synthesized engine, nitro, music, tones
    multiplayer/NetworkManager.js
    styles/style.css         Desktop, portrait, landscape layouts
shared/
  cars.js                    Car selection and arcade tuning
  track.js                   Shared circuit geometry
  physics.js                 Movement, barriers, nitro, checkpoints, AI
  collisions.js              Car contact, mass-based impact response, road containment
  scenery.js                 Deterministic trees and camera clearance
server/
  server.js                  HTTP, sockets, input validation, reconnects
  roomManager.js             Rooms, names, car validation, host ownership
  raceManager.js             Authoritative simulation, countdown, results
tests/
  controls.test.js
  collisions.test.js
  handling.test.js
  physics.test.js
  multiplayer.test.js
  wheels.test.js
  scenery.test.js
```

The server accepts driving buttons, never client-supplied positions, lap counts, or finish times. It simulates at 60 ticks/second and sends snapshots at 20 updates/second. The client predicts its car and smooths network corrections. Server-issued session tokens resume a disconnected driver for up to 30 seconds. A connected driver inherits hosting when the host disconnects.

All geometry and audio are generated locally. The UI uses Google Fonts when available, with system-font fallbacks. No API keys, paid models, or asset downloads are required to play after installing the npm dependencies.

## Verification

```sh
npm test
npm run build
```

In environments that disallow spawning Node test workers, run:

```sh
node --test --test-isolation=none tests/*.test.js
```

The automated tests cover car tuning, acceleration/steering/braking/reverse, high-speed steering, controlled drifting and recovery, countersteering, energy conservation, wheel animation, simulation timing, nitro, containment, ordered checkpoints, full three-lap races for every car, rankings, keyboard/multitouch release, real socket room creation/joining, readiness, host restrictions, reconnect identity, authoritative finishes, and replay. Collision regressions include rear-end impacts, side impacts, four-car pileups, guardrail contact, high-speed head-on impacts, and a complete four-car race. Scenery checks verify tree-canopy and camera clearance around the entire circuit.

Browser checks cover the 3D garage, car selection, Quick Race, keyboard input, camera switching, pause/reset, lobby UI, and portrait/landscape layouts. Rendering quality depends on the browser's WebGL support. The low setting disables dynamic shadows and caps pixel density.

The track uses procedural asphalt, gravel, and grass textures, varied forest foliage, and lightweight car contact shadows, including on low graphics quality. Checkpoint banners clear the chase cameras; tree placement checks all nearby road sections. The game does not include licensed high-detail car meshes, vehicle deformation, accounts, global matchmaking, or persistent progression.
