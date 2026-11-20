SHELL := /bin/bash
.DEFAULT_GOAL := help

COMPOSE     := docker compose
COMPOSE_DEV := docker compose -f docker-compose.yml -f docker-compose.dev.yml

## ---------- help ----------
.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_.-]+:.*## / {printf "  \033[32m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## ---------- setup ----------
.PHONY: install env secrets
install: ## Install dependencies (npm workspaces)
	npm ci

env: ## Create .env files from the examples (never overwrites)
	@[ -f .env ] || { cp .env.example .env && echo "create .env"; }
	@[ -f backend/.env ] || { cp backend/.env.example backend/.env && echo "create backend/.env"; }
	@[ -f frontend/.env.local ] || { cp frontend/.env.example frontend/.env.local && echo "create frontend/.env.local"; }
	@$(MAKE) --no-print-directory secrets

secrets: ## Fill empty JWT secrets in backend/.env with random values
	@for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET; do \
	  if grep -qE "^$$k=$$" backend/.env; then \
	    v=$$(openssl rand -base64 48 | tr -d '\n/+='); \
	    sed -i.bak "s|^$$k=$$|$$k=$$v|" backend/.env && rm -f backend/.env.bak && echo "generated $$k"; \
	  fi; \
	done

## ---------- docker: production-like ----------
.PHONY: up down build logs ps restart
up: ## Build and start the whole stack (postgres, redis, backend, frontend)
	$(COMPOSE) up -d --build --wait
	@echo "frontend http://localhost:3000   backend http://localhost:4000/health"

down: ## Stop the stack (keeps data volumes)
	$(COMPOSE) down

build: ## Build the docker images
	$(COMPOSE) build

logs: ## Follow logs (make logs s=backend for one service)
	$(COMPOSE) logs -f --tail=100 $(s)

ps: ## Show containers
	$(COMPOSE) ps

restart: ## Restart a service (make restart s=backend)
	$(COMPOSE) restart $(s)

## ---------- docker: development with hot reload ----------
.PHONY: dev dev-down dev-logs dev-build
dev: ## Start the whole stack in dev mode (hot reload, source bind-mounted)
	$(COMPOSE_DEV) up -d --build --wait --renew-anon-volumes
	@echo "frontend http://localhost:3000   backend http://localhost:4000/health   (make dev-logs)"

dev-down: ## Stop the dev stack
	$(COMPOSE_DEV) down

dev-logs: ## Follow dev logs (make dev-logs s=frontend)
	$(COMPOSE_DEV) logs -f --tail=100 $(s)

dev-build: ## Rebuild dev images (after changing dependencies)
	$(COMPOSE_DEV) build

## ---------- infra only (run backend/frontend on the host) ----------
.PHONY: infra-up infra-down dev-local
infra-up: ## Start only postgres + redis
	$(COMPOSE) up -d --wait postgres redis

infra-down: ## Stop postgres + redis
	$(COMPOSE) stop postgres redis

dev-local: infra-up ## Host-run dev: infra in docker, backend + frontend via npm (needs `make install env`)
	@trap 'kill 0' EXIT; npm run dev:backend & npm run dev:frontend & wait

## ---------- quality ----------
.PHONY: hooks secrets-check lint typecheck test test-cov test-e2e check ci
hooks: ## Enable the git pre-commit hook that blocks secrets
	git config core.hooksPath .githooks
	@echo "pre-commit secret scan enabled"

secrets-check: ## Scan tracked files for secrets (staged files if nothing is tracked yet)
	@if [ -d .git ] && [ -n "$$(git ls-files)" ]; then scripts/check-secrets.sh --all; else echo "no tracked files yet, skipped"; fi

lint: ## ESLint (backend + frontend)
	npm run lint

typecheck: ## TypeScript type check (backend + frontend)
	npm run typecheck

test: ## Unit tests (backend + frontend)
	npm run test

test-cov: ## Unit tests with coverage
	npm run test:cov -w backend && npm run test:cov -w frontend

test-e2e: infra-up ## Backend e2e tests against real postgres + redis
	npm run test:e2e -w backend

check: secrets-check lint typecheck test ## Fast local gate: secrets + lint + types + unit tests

ci: check test-e2e build-apps ## Everything the CI pipeline runs (minus docker image builds)

.PHONY: build-apps
build-apps: ## Build backend (nest) and frontend (next) without docker
	npm run build

## ---------- database / cache shells ----------
.PHONY: psql redis-cli
psql: ## psql shell in the postgres container
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-app} -d $${POSTGRES_DB:-app}

redis-cli: ## redis-cli in the redis container
	$(COMPOSE) exec redis redis-cli

## ---------- cleanup ----------
.PHONY: clean nuke
clean: ## Remove build artefacts
	rm -rf backend/dist frontend/.next backend/coverage frontend/coverage

nuke: ## Stop everything and DELETE data volumes + node_modules (asks first)
	@read -p "This deletes database/redis data and node_modules. Continue? [y/N] " a; [ "$$a" = "y" ]
	$(COMPOSE_DEV) down -v --remove-orphans
	$(MAKE) clean
	rm -rf node_modules backend/node_modules frontend/node_modules
