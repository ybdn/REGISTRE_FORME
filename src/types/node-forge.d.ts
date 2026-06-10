// Shim de types minimal pour node-forge (sous-ensemble réellement utilisé par REGISTRE.FORME).
// @types/node-forge n'est pas installé ; on déclare uniquement la surface employée par
// `src/donnees/chiffrement.ts` (PBKDF2 + AES-GCM + util base64/utf8 + random).
declare module 'node-forge' {
  interface ByteBuffer {
    getBytes(): string;
    bytes(): string;
    length(): number;
  }

  interface Cipher {
    start(options: { iv: string | ByteBuffer; tag?: ByteBuffer }): void;
    update(input: ByteBuffer): void;
    finish(): boolean;
    output: ByteBuffer;
    mode: { tag: ByteBuffer };
  }

  interface MessageDigest {
    update(msg: string): MessageDigest;
    digest(): ByteBuffer;
  }

  const forge: {
    cipher: {
      createCipher(algorithm: string, key: string): Cipher;
      createDecipher(algorithm: string, key: string): Cipher;
    };
    pkcs5: {
      pbkdf2(
        password: string,
        salt: string,
        iterations: number,
        keySize: number,
        md: MessageDigest,
      ): string;
    };
    md: { sha256: { create(): MessageDigest } };
    random: { getBytesSync(count: number): string };
    util: {
      createBuffer(input: string, encoding?: 'utf8' | 'raw' | 'binary'): ByteBuffer;
      encode64(bytes: string): string;
      decode64(base64: string): string;
      encodeUtf8(str: string): string;
      decodeUtf8(bytes: string): string;
    };
  };

  export default forge;
}
