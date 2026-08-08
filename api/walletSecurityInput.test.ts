import { describe, expect, it } from "vitest";
import { walletSecurityRouter } from "./walletSecurityRouter";

// Validation runs before resolvers — a fake ctx never reaches the DB.
const caller = walletSecurityRouter.createCaller({
  req: new Request("http://localhost"),
  resHeaders: new Headers(),
  user: { id: 42 } as never,
});

const valid = {
  walletId: "wk_0123456789abcdef",
  xrplAddress: "ratdmxHPbCxmyBCDAoLkxX2Hryhscxasaq",
  ciphertext: Buffer.from("sealed-payload").toString("base64"),
  salt: Buffer.from("0123456789abcdef").toString("base64"),
  iv: Buffer.from("0123456789ab").toString("base64"),
};

describe("provision input hardening", () => {
  it("rejects a seed field", async () => {
    await expect(caller.provision({ ...valid, seed: "sEd..." } as never)).rejects.toThrow();
  });
  it("rejects a password field", async () => {
    await expect(caller.provision({ ...valid, password: "hunter2" } as never)).rejects.toThrow();
  });
  it("rejects a privateKey field", async () => {
    await expect(
      caller.provision({ ...valid, privateKey: "ED..." } as never),
    ).rejects.toThrow();
  });
  it("rejects any other extra key", async () => {
    await expect(caller.provision({ ...valid, whatever: 1 } as never)).rejects.toThrow();
  });
  it("rejects a malformed XRPL address", async () => {
    await expect(
      caller.provision({ ...valid, xrplAddress: "0xnotanxrpladdress" }),
    ).rejects.toThrow();
  });
  it("rejects non-base64 ciphertext", async () => {
    await expect(
      caller.provision({ ...valid, ciphertext: "!!!not-base64!!!" }),
    ).rejects.toThrow();
  });
  it("rejects ciphertext over 8KB", async () => {
    await expect(
      caller.provision({ ...valid, ciphertext: Buffer.alloc(9000).toString("base64") }),
    ).rejects.toThrow();
  });
});
