#!/bin/bash
# Exercises realm v2 on a local gnoland node (tools: gnokey 1.5, a node at
# 127.0.0.1:26657 with chain ID "dev", the realm deployed at $R). Uses the
# public local test key test1 (gno's DefaultAccount_Seed) and throwaway keys,
# never a real account. Prints one line per check; exits non-zero on the first
# unexpected result.
#   bash ops/v2-local-check.sh
set -u
export PATH=/home/claude/gnocli/bin:$PATH
H=${GNOKEY_HOME:-/tmp/claude-0/gnokeyhome}
R=${REALM:-gno.land/r/nym-sixseven067/markets/v2}
RPC=http://127.0.0.1:26657
SEED='source bonus chronic canvas draft south burst lottery vacant surface solve popular case indicate oppose farm nothing bullet exhibit title speed wink action roast'
mkdir -p "$H"
key() { gnokey list --home "$H" 2>/dev/null | grep -q "^[0-9]*\. $1 " || { if [ "$1" = test1 ]; then printf '%s\n\n\n' "$SEED" | gnokey add test1 --recover --insecure-password-stdin --home "$H" >/dev/null 2>&1; else printf '\n\n' | gnokey add "$1" --insecure-password-stdin --home "$H" >/dev/null 2>&1; fi; }; }
addr() { gnokey list --home "$H" | grep "^[0-9]*\. $1 " | grep -o 'addr: g1[a-z0-9]*' | cut -c7-; }
pub() { gnokey list --home "$H" | grep "^[0-9]*\. $1 " | grep -o 'pub: gpub1[a-z0-9]*' | cut -c6-; }
# The signing key comes last; gnokey wants every flag before it.
tx() { local n=$#; local last=${!n}; echo "" | gnokey maketx "${@:1:$((n-1))}" -gas-fee 1000000ugnot -gas-wanted 50000000 -remote $RPC -chainid dev -broadcast -insecure-password-stdin --home "$H" "$last" 2>&1; }
call() { local who=$1 func=$2; shift 2; local args=(); for a in "$@"; do args+=(-args "$a"); done; tx call -pkgpath $R -func "$func" "${args[@]}" $SEND "$who"; }
q() { gnokey query vm/qeval -data "$R.$1" -remote $RPC 2>&1 | sed -n 's/^data: //p'; }
expect_ok() { if echo "$2" | grep -q "OK!"; then echo "ok   $1"; else echo "FAIL $1"; echo "$2" | tail -6; exit 1; fi; }
expect_refused() { if echo "$3" | grep -q "$2"; then echo "ok   $1 (refused: $2)"; else echo "FAIL $1, expected \"$2\""; echo "$3" | tail -6; exit 1; fi; }

key test1; key oracle; key robot
T=$(addr test1); O=$(addr oracle)
SEND=""; tx send -to "$O" -send 10000000ugnot test1 >/dev/null
NOW=$(date +%s); ID=local-v2-$NOW; COND=0x$(printf 'c%.0s' $(seq 1 64))
SEND=""
expect_ok "CreateMarket by the administrator" "$(call test1 CreateMarket "$ID" 'Will the local check pass?' 'Exact rules.' "$COND" 111 222 Yes No $((NOW + 30*86400)) 420000 600000 40000 "$O" "$T" Politics)"
expect_refused "the oracle must be separate" "the oracle must be a separate account" "$(call test1 CreateMarket "$ID-b" 'Q?' 'R' "$COND" 111 222 Yes No $((NOW + 86400)) 420000 600000 40000 "$T" "$T" Politics)"
SEND="-send 5000000ugnot"; expect_ok "Fund 5 GNOT" "$(call test1 Fund "$ID")"
SEND="-send 420000ugnot"; expect_refused "Buy without the fee" "send the exact cost plus fee" "$(call test1 Buy "$ID" Yes 1000000 420000)"
SEND="-send 429744ugnot"; expect_ok "Buy 1 Yes share for cost 0.42 plus fee 0.009744" "$(call test1 Buy "$ID" Yes 1000000 420000)"
SEND=""
JSON=$(q "MarketJSON(\"$ID\")")
echo "$JSON" | grep -q '\\"feesUgnot\\":\\"9744\\"' && echo "ok   MarketJSON shows the fee held" || { echo "FAIL fee not in MarketJSON"; echo "$JSON" | head -c 600; exit 1; }

# A match market names its two teams in token order; the same name twice is refused.
MATCH=$ID-match
expect_refused "the same name for both outcomes" "invalid outcome names" "$(call test1 CreateMarket "$MATCH" 'Dodgers vs. Brewers' 'Exact rules.' "$COND" 111 222 'Los Angeles Dodgers' 'Los Angeles Dodgers' $((NOW + 30*86400)) 550000 470000 40000 "$O" "$T" Sports)"
expect_ok "CreateMarket for a match, outcomes named" "$(call test1 CreateMarket "$MATCH" 'Dodgers vs. Brewers' 'Exact rules.' "$COND" 111 222 'Los Angeles Dodgers' 'Milwaukee Brewers' $((NOW + 30*86400)) 550000 470000 40000 "$O" "$T" Sports)"
q "MarketJSON(\"$MATCH\")" | grep -q '\\"yesLabel\\":\\"Los Angeles Dodgers\\",\\"noLabel\\":\\"Milwaukee Brewers\\"' && echo "ok   MarketJSON carries the team names" || { echo "FAIL names not in MarketJSON"; q "MarketJSON(\"$MATCH\")" | head -c 600; exit 1; }

# A session key bound to test1, limited to this realm and to 5 GNOT of gas: it may quote and pause, not list or resume.
tx session revokeall test1 >/dev/null
expect_ok "session for the robot key, 1 hour, this realm only" "$(tx session create -pubkey "$(pub robot)" -allow-paths "vm/exec:$R" -expires-at 1h -spend-limit 5000000ugnot test1)"
sess() { local func=$1; shift; local args=(); for a in "$@"; do args+=(-args "$a"); done; tx call -pkgpath $R -func "$func" "${args[@]}" -master test1 robot; }
expect_ok "SetQuote through the session key" "$(sess SetQuote "$ID" 450000 560000 1)"
expect_refused "CreateMarket through the session key" "needs the account's own key" "$(sess CreateMarket "$ID-s" 'Q?' 'R' "$COND" 111 222 Yes No $((NOW + 86400)) 420000 600000 40000 "$O" "$T" Politics)"
expect_ok "Pause through the session key" "$(sess Pause "$ID")"
expect_refused "Resume through the session key" "needs the account's own key" "$(sess Resume "$ID")"
expect_ok "Resume by the administrator's own key" "$(call test1 Resume "$ID")"

HASH=$(q "BindingHash(\"Will the local check pass?\", \"Exact rules.\")" | grep -o '[0-9a-f]\{64\}' | head -1)
EVID=$(printf 'e%.0s' $(seq 1 64))
expect_refused "ProposeOutcome by someone else" "oracle only" "$(call test1 ProposeOutcome "$ID" "$COND" "$HASH" 111 222 Void "$EVID")"
expect_ok "ProposeOutcome Void by the oracle" "$(call oracle ProposeOutcome "$ID" "$COND" "$HASH" 111 222 Void "$EVID")"
expect_refused "Finalize inside the window" "the dispute window is still open" "$(call test1 Finalize "$ID")"
expect_ok "CancelProposal by the guardian" "$(call test1 CancelProposal "$ID")"
q "MarketJSON(\"$ID\")" | grep -q '\\"state\\":\\"paused\\"' && echo "ok   a cancelled proposal leaves the market paused" || { echo "FAIL state after cancel"; exit 1; }
echo "market $ID checked on $RPC"
