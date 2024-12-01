# Basisimage mit Node.js
FROM node:20-alpine

# Arbeitsverzeichnis festlegen
WORKDIR /app

# Abhängigkeiten installieren
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm

# Anwendungsdateien kopieren
COPY . .

# Abhängigkeiten installieren und App bauen
RUN corepack enable && pnpm install && pnpm run build

# Port freigeben
EXPOSE 3000

# Befehl zum Starten der App
CMD ["pnpm", "run", "dev"]