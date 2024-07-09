FROM node:18

WORKDIR /usr/src/app

COPY package.json .

RUN npm install

COPY dist ./dist

CMD ["npm", "run", "start:prod"]
