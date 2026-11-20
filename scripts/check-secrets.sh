#!/usr/bin/env bash
# Blocks secrets from entering git.
#   scripts/check-secrets.sh --staged   (default; used by the pre-commit hook) scan what is about to be committed
#   scripts/check-secrets.sh --all      scan every tracked file (used by CI)
# Never prints a secret: findings are reported as file:line + rule name only.
# A line that is a deliberate false positive can carry the marker "secrets-ok".
set -u
cd "$(git rev-parse --show-toplevel)" || exit 2

mode="${1:---staged}"
if [ "$mode" = "--all" ]; then
  files=$(git ls-files)
  read_file() { cat -- "$1"; }
else
  files=$(git diff --cached --name-only --diff-filter=ACM)
  read_file() { git show ":$1"; } # the staged version, not the working copy
fi
[ -z "$files" ] && exit 0

fail=0
report() { echo "  ✗ $1"; fail=1; }

# 1) files that must never be committed
while IFS= read -r f; do
  b=$(basename -- "$f")
  case "$b" in
    .env.example|.env.sample|.env.template) ;;
    .env|.env.*|*.pem|*.key|*.p12|*.pfx|id_rsa*|id_ed25519*|credentials.json|*.keystore)
      report "$f: secret-bearing file name ($b)" ;;
  esac
done <<< "$files"

# 2) well-known token formats + dotenv-style assignments of secret-looking variables with a real-looking value
patterns=(
  'gsk_[A-Za-z0-9]{20,}|Groq API key'
  'gh[pousr]_[A-Za-z0-9]{30,}|GitHub token'
  'github_pat_[A-Za-z0-9_]{30,}|GitHub fine-grained token'
  'sk-(ant-|proj-)?[A-Za-z0-9_-]{24,}|OpenAI/Anthropic-style API key'
  'AKIA[0-9A-Z]{16}|AWS access key id'
  'xox[baprs]-[A-Za-z0-9-]{10,}|Slack token'
  '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----|private key'
  'eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}|JWT'
  '^[[:space:]]*(export )?[A-Z0-9_]*(SECRET|API_KEY|APIKEY|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*=[^[:space:]#$]{12,}|secret-looking variable with a value'
)

# 3) the literal secret values from the local env files: catches a key pasted anywhere (code, docs, tests...)
vals=$(mktemp); trap 'rm -f "$vals"' EXIT; chmod 600 "$vals"
for envf in .env backend/.env frontend/.env.local; do
  [ -f "$envf" ] || continue
  grep -E '^[A-Z0-9_]*(SECRET|API_KEY|APIKEY|TOKEN|PASSWORD|PRIVATE_KEY)[A-Z0-9_]*=.{8,}' "$envf" \
    | sed -E 's/^[^=]*=//; s/^["'\'']//; s/["'\'']$//' >> "$vals"
done

while IFS= read -r f; do
  case "$f" in package-lock.json|*.png|*.jpg|*.ico|*.woff2) continue ;; esac
  content=$(read_file "$f" 2>/dev/null) || continue
  printf '%s\n' "$content" | grep -qI . || continue # binary / empty

  for entry in "${patterns[@]}"; do
    re="${entry%|*}"; name="${entry##*|}"
    hits=$(printf '%s\n' "$content" | grep -nE -e "$re" | grep -v 'secrets-ok' | cut -d: -f1 | head -3 | tr '\n' ',' )
    [ -n "$hits" ] && report "$f:${hits%,}: $name"
  done

  if [ -s "$vals" ]; then
    hits=$(printf '%s\n' "$content" | grep -nF -f "$vals" | grep -v 'secrets-ok' | cut -d: -f1 | head -3 | tr '\n' ',')
    [ -n "$hits" ] && report "$f:${hits%,}: contains a value from your local .env files"
  fi
done <<< "$files"

if [ "$fail" -ne 0 ]; then
  echo
  echo "Secrets check FAILED: nothing was committed."
  echo "Remove the secret (use an env var / the *.example template), or mark a deliberate false positive with 'secrets-ok'."
  exit 1
fi
exit 0
