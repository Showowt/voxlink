#!/usr/bin/env bash
# Recreate the Entrevoz iOS distribution signing material in ~/.entrevoz-ios-signing.
#
# WHY THIS EXISTS: the App Store Connect API key for this account is Developer-role.
# It can create certificates via the API and upload builds, but it CANNOT cloud-sign
# a distribution build (Xcode automatic export → "Cloud signing permission error").
# So we create our OWN distribution cert via the API (we keep the private key),
# make an App Store profile bound to it, and MANUAL-sign the export.
#
# Usage: ASC_KEY_PATH=/path/AuthKey_XXXX.p8 ASC_KEY_ID=XXXX bash native/make-ios-signing.sh
set -euo pipefail
ASC_ISSUER_ID="${ASC_ISSUER_ID:-18ea1a6b-9f32-4076-b95b-56b7f0955a4c}"
: "${ASC_KEY_PATH:?set ASC_KEY_PATH}"; : "${ASC_KEY_ID:?set ASC_KEY_ID}"
DEST="$HOME/.entrevoz-ios-signing"; mkdir -p "$DEST"; chmod 700 "$DEST"
BUNDLE="com.entrevoz.app"

python3 - "$ASC_KEY_PATH" "$ASC_KEY_ID" "$ASC_ISSUER_ID" "$DEST" "$BUNDLE" <<'PY'
import sys, os, json, time, base64, subprocess, urllib.request
KEY_PATH, KEY_ID, ISSUER, DEST, BUNDLE = sys.argv[1:6]
from cryptography.hazmat.primitives.serialization import load_pem_private_key
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
def b64url(b):
    if isinstance(b,str): b=b.encode()
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def jwt():
    now=int(time.time())
    h=b64url(json.dumps({"alg":"ES256","kid":KEY_ID,"typ":"JWT"}))
    p=b64url(json.dumps({"iss":ISSUER,"iat":now,"exp":now+1100,"aud":"appstoreconnect-v1"}))
    si=f"{h}.{p}".encode()
    k=load_pem_private_key(open(KEY_PATH,'rb').read(),password=None)
    der=k.sign(si,ec.ECDSA(hashes.SHA256())); r,s=decode_dss_signature(der)
    return si.decode()+"."+b64url(r.to_bytes(32,'big')+s.to_bytes(32,'big'))
def api(path,method="GET",body=None):
    data=json.dumps(body).encode() if body else None
    req=urllib.request.Request("https://api.appstoreconnect.apple.com"+path,data=data,method=method,
        headers={"Authorization":"Bearer "+jwt(),"Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req,timeout=30) as r:
            raw=r.read(); return r.status,(json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw=e.read()
        try: return e.code,(json.loads(raw) if raw.strip() else {})
        except: return e.code,{"raw":raw.decode()[:300]}

# 1. RSA2048 key + CSR (we keep the private key)
subprocess.run(["openssl","genrsa","-out",f"{DEST}/dist.key","2048"],check=True,capture_output=True)
subprocess.run(["openssl","req","-new","-key",f"{DEST}/dist.key","-out",f"{DEST}/dist.csr",
    "-subj","/CN=Entrevoz Distribution/O=Philip Micheal Mcgill/C=US"],check=True,capture_output=True)
st,resp=api("/v1/certificates",method="POST",body={"data":{"type":"certificates",
    "attributes":{"certificateType":"IOS_DISTRIBUTION","csrContent":open(f"{DEST}/dist.csr").read()}}})
assert st in (200,201), f"cert create failed {st}: {resp}"
cid=resp["data"]["id"]; open(f"{DEST}/dist.cer","wb").write(base64.b64decode(resp["data"]["attributes"]["certificateContent"]))
print("cert id:",cid)

# 2. bundleId id + fresh App Store profile bound to the cert
st,bids=api(f"/v1/bundleIds?filter[identifier]={BUNDLE}&limit=5")
bid=next(b["id"] for b in bids["data"] if b["attributes"]["identifier"]==BUNDLE)
st,profs=api("/v1/profiles?limit=200")
for p in profs.get("data",[]):
    if p["attributes"].get("profileType")=="IOS_APP_STORE" and BUNDLE in p["attributes"].get("name",""):
        api("/v1/profiles/"+p["id"],method="DELETE")
st,resp=api("/v1/profiles",method="POST",body={"data":{"type":"profiles",
    "attributes":{"name":"Entrevoz AppStore MM","profileType":"IOS_APP_STORE"},
    "relationships":{"bundleId":{"data":{"type":"bundleIds","id":bid}},
        "certificates":{"data":[{"type":"certificates","id":cid}]}}}})
assert st in (200,201), f"profile create failed {st}: {resp}"
uuid=resp["data"]["attributes"]["uuid"]
open(f"{DEST}/Entrevoz_AppStore_MM.mobileprovision","wb").write(base64.b64decode(resp["data"]["attributes"]["profileContent"]))
open(f"{DEST}/profile_uuid.txt","w").write(uuid)
print("profile uuid:",uuid)
PY

# 3. DER→PEM, legacy p12 (so macOS `security` can import), fetch WWDR G3
openssl x509 -inform DER -in "$DEST/dist.cer" -out "$DEST/dist.pem"
openssl pkcs12 -export -legacy -inkey "$DEST/dist.key" -in "$DEST/dist.pem" \
  -out "$DEST/dist.p12" -passout pass:evp12 -name "Apple Distribution: Entrevoz MM"
curl -sS -o "$DEST/AppleWWDRCAG3.cer" https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer
chmod 600 "$DEST"/*
echo "✅ signing material ready in $DEST (p12 pass: evp12). Now run native/build-ios.sh"
