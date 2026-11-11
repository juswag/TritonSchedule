#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_ENV="$ROOT_DIR/backend/.env"
FRONTEND_ENV="$ROOT_DIR/frontend/.env"
NPM_CACHE_DIR="$ROOT_DIR/.npm-cache"

CHECK_ONLY=0
INSTALL_DEPS=1
SUPABASE_MODE="auto"
RESET_DB=0
LOCAL_SUPABASE_STARTED=0

usage() {
  cat <<'USAGE'
Usage: npm run setup -- [options]

Sets up this workspace for local TritonSchedule development.

Options:
  --check           Validate env/scripts only; do not install or start services
  --skip-install    Do not install npm dependencies
  --skip-supabase   Do not start local Supabase
  --local           Start the local Supabase stack with the Supabase CLI
  --reset-db        Reset the local Supabase database after start (destructive to local data)
  -h, --help        Show this help
USAGE
}

log() {
  printf '[setup] %s\n' "$*"
}

warn() {
  printf '[setup] warning: %s\n' "$*" >&2
}

fail() {
  printf '[setup] error: %s\n' "$*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check)
      CHECK_ONLY=1
      INSTALL_DEPS=0
      SUPABASE_MODE="skip"
      ;;
    --skip-install)
      INSTALL_DEPS=0
      ;;
    --skip-supabase)
      SUPABASE_MODE="skip"
      ;;
    --local)
      SUPABASE_MODE="local"
      ;;
    --reset-db)
      SUPABASE_MODE="local"
      RESET_DB=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
  shift
done

env_value() {
  local key="$1"
  local file="$2"

  awk -F= -v key="$key" '
    $0 ~ /^[[:space:]]*#/ { next }
    $1 ~ "^[[:space:]]*" key "[[:space:]]*$" {
      value = $0
      sub(/^[^=]*=/, "", value)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      if (value ~ /^".*"$/ || value ~ /^'\''.*'\''$/) {
        value = substr(value, 2, length(value) - 2)
      }
      print value
      exit
    }
  ' "$file"
}

has_env_key() {
  local key="$1"
  local file="$2"

  grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "$file"
}

is_placeholder() {
  local value="$1"

  [[ -z "$value" ]] ||
    [[ "$value" == your_* ]] ||
    [[ "$value" == your-* ]] ||
    [[ "$value" == *your-project-ref* ]] ||
    [[ "$value" == *your_password* ]] ||
    [[ "$value" == *your_*_here ]] ||
    [[ "$value" == *example.supabase.co* ]] ||
    [[ "$value" == *change_me* ]] ||
    [[ "$value" == changeme ]]
}

ensure_env_from_example() {
  local env_file="$1"
  local example_file="$2"
  local label="$3"

  if [[ -f "$env_file" ]]; then
    return
  fi

  if (( CHECK_ONLY )); then
    fail "Missing $label env file: $env_file"
  fi

  [[ -f "$example_file" ]] || fail "Missing $label env file and example: $example_file"
  cp "$example_file" "$env_file"
  warn "Created $label env file from $example_file"
}

set_env_key() {
  local file="$1"
  local key="$2"
  local value="$3"

  if has_env_key "$key" "$file"; then
    local tmp
    tmp="$(mktemp "${file}.tmp.XXXXXX")"
    ENV_KEY="$key" ENV_VALUE="$value" perl -0pe '
      s/^[ \t]*\Q$ENV{ENV_KEY}\E[ \t]*=.*/$ENV{ENV_KEY} . "=" . $ENV{ENV_VALUE}/mge
    ' "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

comment_env_key() {
  local file="$1"
  local key="$2"

  local tmp
  tmp="$(mktemp "${file}.tmp.XXXXXX")"
  ENV_KEY="$key" perl -0pe '
    s/^[ \t]*\Q$ENV{ENV_KEY}\E[ \t]*=.*/"# disabled by setup: " . $&/mge
  ' "$file" > "$tmp"
  mv "$tmp" "$file"
}

ensure_no_mongo_env() {
  local prohibited=(MONGO_URI DB_NAME)
  local found=()

  for key in "${prohibited[@]}"; do
    if has_env_key "$key" "$BACKEND_ENV"; then
      found+=("$key")
    fi
  done

  if (( ${#found[@]} <= 0 )); then
    return
  fi

  if (( CHECK_ONLY )); then
    fail "Remove MongoDB env vars from backend/.env: ${found[*]}. This workspace uses Supabase."
  fi

  for key in "${found[@]}"; do
    comment_env_key "$BACKEND_ENV" "$key"
  done

  warn "Commented out old MongoDB env vars in backend/.env: ${found[*]}"
}

status_env_value() {
  local key="$1"
  local status="$2"

  printf '%s\n' "$status" | awk -F= -v key="$key" '
    $1 == key {
      value = $0
      sub(/^[^=]*=/, "", value)
      gsub(/^"|"$/, "", value)
      print value
      exit
    }
  '
}

sync_local_supabase_env() {
  local status
  status="$(supabase status -o env)"

  set_env_key "$BACKEND_ENV" SUPABASE_URL "$(status_env_value API_URL "$status")"
  set_env_key "$BACKEND_ENV" SUPABASE_SERVICE_ROLE_KEY "$(status_env_value SERVICE_ROLE_KEY "$status")"

  log "Synced backend/.env from local Supabase status."
}

has_required_supabase_env() {
  local required=(SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY)

  for key in "${required[@]}"; do
    if is_placeholder "$(env_value "$key" "$BACKEND_ENV")"; then
      return 1
    fi
  done

  return 0
}

is_local_supabase_url() {
  local value="$1"

  [[ "$value" == http://127.0.0.1:54321* ]] || [[ "$value" == http://localhost:54321* ]]
}

is_hosted_supabase_url() {
  local value="$1"

  [[ "$value" == https://*.supabase.co* ]]
}

require_command() {
  local name="$1"
  command -v "$name" >/dev/null 2>&1 || fail "Missing required command: $name"
}

start_local_supabase() {
  if (( LOCAL_SUPABASE_STARTED )); then
    return
  fi

  require_command supabase
  require_command docker

  docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker or Colima before starting local Supabase."

  log "Starting local Supabase"
  (cd "$ROOT_DIR" && supabase start)
  LOCAL_SUPABASE_STARTED=1

  if (( RESET_DB )); then
    warn "Resetting local Supabase database from migrations. Local data will be replaced."
    (cd "$ROOT_DIR" && supabase db reset --local)
  fi
}

validate_backend_env() {
  local required=(SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY)
  local missing=()

  for key in "${required[@]}"; do
    if is_placeholder "$(env_value "$key" "$BACKEND_ENV")"; then
      missing+=("$key")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    fail "Missing or placeholder required backend env values in backend/.env: ${missing[*]}"
  fi

  log "Validated backend/.env for Supabase local development."
}

validate_frontend_env() {
  local required=(VITE_API_BASE_URL)
  local missing=()

  for key in "${required[@]}"; do
    if is_placeholder "$(env_value "$key" "$FRONTEND_ENV")"; then
      missing+=("$key")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    warn "Missing or placeholder frontend env values in frontend/.env: ${missing[*]}"
  fi
}

install_deps_for() {
  local dir="$1"
  local label="$2"

  if [[ ! -f "$dir/package.json" ]]; then
    return
  fi

  if [[ -d "$dir/node_modules" ]]; then
    log "$label dependencies already installed; skipping."
    return
  fi

  log "Installing $label dependencies"
  if [[ -f "$dir/package-lock.json" ]]; then
    npm --prefix "$dir" --cache "$NPM_CACHE_DIR" ci
  else
    npm --prefix "$dir" --cache "$NPM_CACHE_DIR" install
  fi
}

ensure_env_from_example "$BACKEND_ENV" "$ROOT_DIR/backend/.env.example" "backend"
ensure_env_from_example "$FRONTEND_ENV" "$ROOT_DIR/frontend/.env.example" "frontend"
ensure_no_mongo_env

if ! has_required_supabase_env && (( ! CHECK_ONLY )) && [[ "$SUPABASE_MODE" != "skip" ]]; then
  start_local_supabase
  sync_local_supabase_env
fi

validate_backend_env
validate_frontend_env

if (( INSTALL_DEPS )); then
  install_deps_for "$ROOT_DIR" "root"
  install_deps_for "$ROOT_DIR/backend" "backend"
  install_deps_for "$ROOT_DIR/frontend" "frontend"
fi

supabase_url="$(env_value SUPABASE_URL "$BACKEND_ENV")"
case "$SUPABASE_MODE" in
  skip)
    log "Skipping local Supabase startup."
    ;;
  local)
    if is_hosted_supabase_url "$supabase_url"; then
      warn "backend/.env points at hosted Supabase; starting local Supabase anyway because --local/--reset-db was requested."
    fi
    start_local_supabase
    sync_local_supabase_env
    ;;
  auto)
    if is_local_supabase_url "$supabase_url"; then
      start_local_supabase
      sync_local_supabase_env
    else
      log "Hosted/non-local SUPABASE_URL detected; skipping local Supabase startup. Use --local to start the local stack."
    fi
    ;;
  *)
    fail "Invalid Supabase mode: $SUPABASE_MODE"
    ;;
esac

log "Setup complete."
