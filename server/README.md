# Synthetic evidence API

This local demo API stores synthetic PDF/PNG evidence outside the repository and serves only opaque IDs and safe metadata. It does not expose a file-download route and cannot approve or release escrow funds.

## Run

Requires Node.js 22.18 or newer with TypeScript type stripping enabled.

```powershell
node server/src/index.mts
node --test server/test/evidence/*.test.mts
```

The API binds to `127.0.0.1:3001`; set `PORT` to change the port. Private files are stored under `%LOCALAPPDATA%\CASCADE\evidence` on Windows, `$XDG_DATA_HOME/cascade/evidence` when configured, or `~/.local/share/cascade/evidence` otherwise.

## Endpoints

`GET /api/v1/health`

```json
{ "status": "ok", "service": "evidence-api" }
```

`POST /api/v1/evidence` accepts one `multipart/form-data` file field named `file`. Only PDF and PNG signatures are accepted, the declared content type and known filename extension must match, and files are limited to 2 MiB.

```json
{
  "evidenceId": "server-generated-uuid",
  "fileDigest": "0x<sha256-of-exact-uploaded-bytes>",
  "status": "FILE_DIGEST_RECORDED",
  "signatureStatus": "UNVERIFIED",
  "duplicateStatus": "UNVERIFIED",
  "reasonCodes": [
    "SIGNATURE_NOT_CHECKED",
    "CONTRACT_DUPLICATE_STATE_NOT_CHECKED"
  ],
  "byteLength": 1234,
  "mediaType": "application/pdf"
}
```

`GET /api/v1/evidence/:id/status` returns the same allowlisted status fields. Original filenames, local paths, file bytes, and internal metadata are not returned. Unsupported uploads, missing records, and request errors return a safe `{ "error": { "code": "...", "message": "..." } }` object.

The API does not verify vendor signatures or query the contract's nullifier registry. The frontend should use `fileDigest` as the contract's `evidenceDigest`; it must obtain vendor authorization separately and treat contract events/state as authoritative for duplicate incidents and releases. Do not interpret a recorded digest as proof that an invoice is authentic. All test data must be synthetic; local filesystem storage is demo-only and is not production authentication, encryption-at-rest, backup, or retention management.
