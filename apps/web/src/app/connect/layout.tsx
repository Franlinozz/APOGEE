// WagmiProvider is mounted once in root layout — no second instance here.
export const metadata = { title: 'Connect Wallet' };

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
