import { hashPassword } from "../lib/admin/password";
const pw = process.argv[2];
if (!pw) { console.error("usage: jiti scripts/gen-admin-hash.ts <password>"); process.exit(1); }
hashPassword(pw).then((h) => console.log(h));
