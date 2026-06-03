#!/bin/sh
mkdir static || exit 1
cp list.js common.js index.js collection.js list.html collection.html index.html main.css 404.html icon.png static/ || exit 1
rclone copy -P static/ linode:/stickeralbum.pommicket.com/ || exit 1
rm -r static || exit 1
