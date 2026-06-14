# stickeralbum

For tracking progress for the sticker album of
the world football tournament whose name will go
unmentioned for legal reasons.

Hosted at https://stickeralbum.pommicket.com

## Design

Simple “vanilla JavaScript” frontend with a Rust backend
that operates on a sqlite database (`database.sq3`).
They communicate over HTTP via a simple protocol
(1-byte command followed by arguments followed by terminator byte).
Runs on port 51822 by default (configuration will have to
be done by changing the source code, sorry).

Static files are in the root directory, backend is in the
`server` directory (you will probably want to put it behind
some proxy to get TLS and so on). To build the backend, just do
`cargo build --release`.

If you want to host it yourself, you need to change
`SERVER_URL` in `common.js` to the URL where you are hosting
the backend.
