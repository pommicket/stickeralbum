#!/bin/sh
mkdir static || exit 1
cp collection.html index.html main.css static/ || exit 1
rclone copy -P static/ linode:/stickeralbum.pommicket.com/ || exit 1
rm -r static || exit 1
