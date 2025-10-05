#!/bin/zsh
npx hexo g
npx hexo d
rsync -avzP --delete public/ lighthouse@43.135.10.233:/var/www/miceworld.top/