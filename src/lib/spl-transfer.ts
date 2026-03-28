import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export async function sendSplToken({
  connection,
  payer,
  mint,
  destinationOwner,
  amountRaw,
}: {
  connection: Connection;
  payer: Keypair;
  mint: PublicKey;
  destinationOwner: PublicKey;
  amountRaw: bigint;
}): Promise<string> {
  const owner = payer.publicKey;
  const sourceAta = await getAssociatedTokenAddress(mint, owner, false, TOKEN_PROGRAM_ID);
  const destAta = await getAssociatedTokenAddress(
    mint,
    destinationOwner,
    false,
    TOKEN_PROGRAM_ID
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  try {
    await getAccount(connection, destAta);
  } catch {
    tx.add(
      createAssociatedTokenAccountInstruction(
        owner,
        destAta,
        destinationOwner,
        mint,
        TOKEN_PROGRAM_ID
      )
    );
  }

  tx.add(
    createTransferInstruction(
      sourceAta,
      destAta,
      owner,
      amountRaw,
      [],
      TOKEN_PROGRAM_ID
    )
  );

  tx.sign(payer);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight });
  return sig;
}
