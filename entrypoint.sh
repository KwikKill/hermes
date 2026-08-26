#!/bin/sh

npm install
npm run build
npx prisma migrate deploy
npm run start
