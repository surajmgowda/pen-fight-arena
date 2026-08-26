# Pen Fight Arena - One-Click Web Deployment

This folder is ready for a Node.js web-service host such as Render.

## For a non-technical user

You do NOT need a computer to play after the website is deployed.

The simplest phone-only route is:

1. Create a GitHub account.
2. Create a new repository named `pen-fight-arena`.
3. Upload ALL files from this folder to that repository.
4. Create a Render account.
5. Connect GitHub to Render.
6. Choose the `pen-fight-arena` repository.
7. Render detects `render.yaml`, installs dependencies, and starts the server.
8. Render gives you a public `onrender.com` web address.
9. Open that address on Android/iPhone.
10. Use Add to Home Screen to install it like an app.

The online game uses WebSockets. Render web services support WebSockets. Free Render services can spin down after 15 minutes of inactivity, so the first connection after idle can take around a minute.

## Files

- `server.js` = multiplayer server + HTTP server
- `pen_fight_arena_online_client.html` = game
- `manifest.webmanifest` = phone app manifest
- `sw.js` = PWA caching
- `icon.svg` = app icon
- `package.json` = Node dependencies/start command
- `render.yaml` = deployment settings

## Room-owner AI

The owner can choose:
- No AI
- Exact AI count
- Fill empty slots with AI

AI is never added when the owner selects No AI.

## Important

Do not use GitHub Pages for the full online version because the multiplayer WebSocket server must run somewhere. Use a Web Service host such as Render.
