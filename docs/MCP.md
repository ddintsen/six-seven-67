# Gno MCP installation

Local Codex now registers `gnomcp` at `C:/Users/dddin/.codex/tools/gno-mcp/gnomcp.exe`. Existing servers were preserved. Configuration was backed up outside the project before registration; neither backup nor global config is packaged.

## Pinned source and verification

- Repository: [gnoverse/gno-mcp](https://github.com/gnoverse/gno-mcp/tree/v0.12.0), tag0.12.0, commit92a734801beaef32a0c639900bb4fda3b4136bb3. Apache2.0 license is beside the executable.
- Windows had no matching release binary; built from the pinned module with official portable Go1.26.9, CGO disabled and release version ldflags.
- Binary SHA256:9cbdd622960c7885e59f15b49b4cb039d322957de9e1f33268ab9fe37c2eb442. `gnomcp.exe version` returns0.12.0.
- Stdio protocol2025-06-18: initialize, tools/list (25 tools) and read-only gno_status passed.
- `codex mcp add gnomcp -- <absolute executable>` succeeded. Sanitized `codex mcp get gnomcp --json` confirms enabled=true and the installed command.

Default profile: Onyx testnet, `onyx-1`. Mainnet profile is read-only. No key was created and no MCP mutation invoked. Registration does not prove deployment, source typechecking or financial safety.

On October 11 the native MCP tools became available in this chat. `gno_profile_list` returned local/dev, mainnet/gnoland-1 (read-only) and testnet/onyx-1. `gno_status(profile="testnet")` verified the live Onyx node at height 322603, block time `2026-10-11T09:01:39Z`, with `chain_id_mismatch=false`. This confirms the chat-to-MCP read path, separately from the earlier manual stdio handshake.

## Reproduce

Follow the pinned [official build instructions](https://github.com/gnoverse/gno-mcp/blob/v0.12.0/docs/gnomcp.md). Verify toolchain compatibility, retain the license, build `github.com/gnoverse/gno-mcp/cmd/gnomcp@v0.12.0` with `-ldflags '-X main.version=0.12.0'`, then register the actual executable path with `codex mcp add`. No npm package, wallet SDK or unpinned installer is required.

## Claude session, October 11

A second copy was built in the Claude cloud workspace (Linux x64) from the same pinned module: `GOTOOLCHAIN=go1.26.9 CGO_ENABLED=0 go install -ldflags '-X main.version=0.12.0' github.com/gnoverse/gno-mcp/cmd/gnomcp@v0.12.0`. `gnomcp version` prints `0.12.0`; the stdio handshake (protocol 2025-06-18) listed 25 tools; `gno_status(testnet)` read live Onyx (`onyx-1`, block 331734 at 18:09 UTC). The Linux binary's SHA-256 is `9de38394cb083114401f3cb1cd344844cdb8a1c8fd0489613ca010a36c44dc6a`; it differs from the Windows build's hash, as expected across platforms.

It was used for: reading Onyx packages, the name registry and the CLA state (enforcement is off); generating and faucet-funding an operator key; deploying the realm, creating and funding the four bound markets, requoting and buying on a **local** gnoland v1.5.0 node; and signing the local-chain browser test. A write to the shared Onyx testnet (registering `nym-sixseven067`) was stopped for the owner's explicit approval and has not been performed.

To use the existing Windows build from the Claude desktop app, add it to `%APPDATA%\Claude\claude_desktop_config.json` and restart the app:

```json
{
  "mcpServers": {
    "gnomcp": { "command": "C:\\Users\\dddin\\.codex\\tools\\gno-mcp\\gnomcp.exe", "args": [] }
  }
}
```
