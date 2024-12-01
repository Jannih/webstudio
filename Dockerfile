# Basisimage mit Node.js
FROM node:20-alpine AS base

# Abhängigkeiten installieren
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Dateien des Paketmanagers kopieren
COPY package.json pnpm-lock.yaml* ./

# Patch-Dateien kopieren (falls vorhanden)
COPY patches ./patches

# tsconfig base.json in das node_modules-Verzeichnis des @webstudio-is/tsconfig-Pakets kopieren
COPY packages/tsconfig/base.json ./node_modules/@webstudio-is/tsconfig/base.json

# remix global installieren
RUN npm install -g remix

# Abhängigkeiten installieren
RUN \
    corepack enable pnpm && pnpm install

# Webstudio-Anwendung bauen
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Abhängigkeiten für die apps/builder-Anwendung installieren
RUN corepack enable pnpm && cd apps/builder && pnpm install

RUN \
    corepack enable pnpm && pnpm build

# Datenbank-Schema erstellen
RUN pnpm migrations migrate

# Letzte Stufe: Laufzeitumgebung einrichten
FROM base AS runner
WORKDIR /app
ENV NODE_ENV production

# Anwendungsbenutzer erstellen und festlegen
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Gebaute Dateien und notwendige Laufzeitdateien aus der Builder-Stufe kopieren
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules

# Eigentümerschaft der Verzeichnisse auf den Anwendungsbenutzer ändern
RUN chown -R nextjs:nodejs .

# Zu Nicht-Root-Benutzer wechseln
USER nextjs

# Port freigeben, auf dem die App läuft
EXPOSE 3000
ENV PORT 3000

# Befehl zum Starten der Anwendung
CMD ["pnpm", "dev"]