#!/bin/sh
cd server || exit 1
cargo b --release
cd ..
ssh panini sudo systemctl stop panini-server.service
scp server/target/release/server panini:
ssh panini sudo systemctl start panini-server.service
