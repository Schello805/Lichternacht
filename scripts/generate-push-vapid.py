"""Generate private VAPID material locally, never print the private key."""

import argparse
import base64
import os
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-key', type=Path, required=True, help='Private PEM destination outside public webroot or inside .private/')
    arguments = parser.parse_args()
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    root = Path(__file__).resolve().parents[1]
    destination = arguments.private_key.resolve()
    if root in destination.parents and root / '.private' not in destination.parents:
        parser.error('Private key must not be written into the public webroot')
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    key = ec.generate_private_key(ec.SECP256R1())
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    print('PROGRAM_PUSH_PUBLIC_KEY=' + base64.urlsafe_b64encode(public).rstrip(b'=').decode())
    print('PROGRAM_PUSH_PRIVATE_KEY_FILE=' + str(destination))


if __name__ == '__main__':
    main()
