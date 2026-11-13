FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node server.mjs ./
USER node
EXPOSE 8443
CMD ["node", "server.mjs"]
