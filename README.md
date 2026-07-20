# Bottie

**Onchain savings made easy.**

Bottie is a mobile savings app that lets anyone earn yield on their money without understanding crypto. Powered by [YO Protocol](https://docs.yo.xyz), it replaces the complexity of DeFi with a single AI chat interface. Just tell Bottie what you're saving for, and it handles everything.

**[Live App](https://yoyo.s0nderlabs.xyz)** · **[Demo Video](https://www.youtube.com/watch?v=lt3f9EXybj8&t=3s)**

---

## How it works

1. **Sign up with email.** Enter your email, receive a one-time passcode, and you're in — no wallet, no seed phrases. Magic SDK creates a non-custodial embedded EOA behind the scenes.
2. **Smart account activated.** ZeroDev creates an ERC-4337 kernel account on Base using your Magic EOA as the signer. All transactions are gas-sponsored — users never pay gas.
3. **Fund your account** via MoonPay (card, Apple Pay, Google Pay) or receive tokens from an external wallet.
4. **Talk to the AI.** Say "I want to save for a trip to Japan" and the AI checks rates, recommends the best vault, sets a savings goal, and presents a one-tap deposit confirmation.
5. **Earn automatically.** YO Protocol finds the best risk-adjusted yields across DeFi. Zero management fees, zero performance fees.
6. **Withdraw anytime.** No lock-ups, no penalties.
7. **Cross-chain convert.** Move assets across chains (ETH on Base → USDC on Solana, etc.) via Particle Network Universal Account — one identity, one balance, no bridging UX.

## Features

- **AI savings advisor** — Conversational chat with voice input. The AI can check rates, deposit, withdraw, set goals, and narrate your activity in plain English.
- **Gasless transactions** — All on-chain transactions are gas-sponsored via ZeroDev paymaster. Users never need ETH for gas.
- **EIP-7702 delegation** — Magic EOA is delegated to Particle's Universal Account contract via a Type-4 transaction (one-time, per chain). Enables cross-chain operations from the same address with no new deployment.
- **Cross-chain conversion** — Particle Universal Account SDK orchestrates multi-chain asset conversion. Supports Base → Solana, Base → Ethereum, and more.
- **Savings goals** — Set targets like "Japan trip: $5,000" and track progress visually on each position card.
- **Cross-asset deposits** — Deposit USDC into any vault (yoBTC, yoEUR, etc). The YO SDK handles token swaps automatically.
- **Send and receive** — Transfer tokens directly from the app with address validation and token selection.
- **MoonPay on-ramp** — Buy crypto with a card without leaving the app.
- **Activity narration** — AI summarizes your recent transactions in 2–3 sentences.
- **Real mainnet transactions** — All deposits and withdrawals happen on Base mainnet. No testnet, no mocks.
- **PWA support** — Installable as a home screen app with offline fallback.

## Auth & wallet architecture

The previous Privy implementation has been replaced with a three-layer wallet stack:

```
Magic SDK (email OTP)
  └── creates embedded EOA on Base
        ├── ZeroDev Kernel (ERC-4337)   ← primary account for all EVM txs
        │     ECDSA validator: Magic EOA
        │     Gas: ZeroDev paymaster (optional)
        │     Used for: send, deposit, withdraw, swap
        └── Particle Universal Account (EIP-7702)  ← cross-chain only
              Delegation: Magic EOA → UA contract (one-time per chain)
              Used for: Convert sheet (cross-chain asset moves)
```

### Session management

Magic DID tokens expire in 15 seconds and cannot be used as session cookies. After login, the client immediately POSTs the DID token to `/api/auth/session`. The server:
1. Validates the DID token via `@magic-sdk/admin`
2. Mints a signed HS256 JWT (30-day TTL) using `jose`
3. Sets it as an `httpOnly` session cookie

All subsequent API calls read `SESSION_JWT_SECRET`-verified session cookies — no Privy server SDK needed.

### Provider hierarchy

```
MagicProvider
  └── ZeroDevProvider
        └── UniversalAccountProvider
              └── QueryClientProvider
                    └── WagmiProvider   ← plain wagmi (NOT @privy-io/wagmi)
                          └── YieldProvider
```

### `useAuth()` adapter

`src/hooks/use-auth.ts` exposes a drop-in `useAuth()` that mirrors Privy's `usePrivy()` shape exactly:

```ts
user.wallet.address         // Magic EOA address
user.smartWallet.address    // ZeroDev kernel contract address
user.email.address          // Email used at login
```

This allowed all 16+ consuming files to swap `usePrivy` → `useAuth` with import-only changes and no logic rewrites.

## YO Protocol integration

Bottie integrates `@yo-protocol/react` to interact with YO's ERC-4626 vaults on Base.

**Supported vaults:**

| Vault | Friendly name | Underlying asset |
|-------|---------------|-----------------|
| yoUSD | Dollar Savings | USDC |
| yoETH | Ether Savings | WETH |
| yoBTC | Bitcoin Savings | cbBTC |
| yoEUR | Euro Savings | EURC |

**SDK hooks used:**

- `useVaults()` — live vault rates and TVL
- `useUserPositions()` — user's savings positions across vaults
- `useUserBalances()` — wallet token balances
- `useTokenBalance()` — individual token balance for deposit sheets
- `usePreviewDeposit()` — real-time deposit share previews
- `useYoClient()` — access to `YoClient` for transaction preparation

**Transaction methods:**

- `YoClient.prepareDepositWithApproval()` — deposits with automatic token approval
- `YoClient.prepareRedeemWithApproval()` — withdrawals with automatic approval

All transactions are executed through ZeroDev's `kernelClient.sendTransaction()` as batched UserOperations (ERC-4337).

## AI chat

The AI assistant uses DeepSeek Chat (`deepseek-chat`) via the Vercel AI SDK with 10 tools:

| Tool | Type | Description |
|------|------|-------------|
| `get_vault_rates` | Server | Current interest rates for all savings accounts |
| `get_wallet_balance` | Server | User's wallet balance |
| `get_user_positions` | Server | Current savings positions |
| `get_swap_quote` | Server | Token swap quotes via 0x API |
| `create_goal` | Server | Set a savings goal |
| `get_goals` | Server | Retrieve savings goals |
| `deposit` | Client | Save into a vault (requires user confirmation) |
| `withdraw` | Client | Withdraw from a vault (requires user confirmation) |
| `swap` | Client | Swap tokens (requires user confirmation) |
| `swap_and_deposit` | Client | Swap + deposit in one step (requires user confirmation) |

Client-side tools render as confirmation cards in the chat — the AI never moves funds autonomously.

Voice input is powered by Groq Whisper (`whisper-large-v3-turbo`).

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16, React 19 |
| Styling | Tailwind CSS v4, Framer Motion |
| AI | Vercel AI SDK v6, DeepSeek Chat, Groq Whisper |
| Embedded wallet | Magic SDK v33 (email OTP, EIP-7702) |
| Smart account (EVM) | ZeroDev Kernel v3.1 (ERC-4337, ECDSA validator) |
| Cross-chain | Particle Network Universal Account SDK v1.1 (EIP-7702) |
| Session auth | jose (HS256 JWT, httpOnly cookie, 30-day TTL) |
| Gas sponsorship | ZeroDev paymaster |
| Yield | `@yo-protocol/react` SDK |
| Database | Neon Postgres, Drizzle ORM |
| On-ramp | MoonPay |
| Swaps | 0x API |
| Hosting | Vercel |

## Project structure

```
src/
├── app/
│   ├── page.tsx                        # Landing page
│   ├── layout.tsx                      # Root layout (fonts, metadata, providers)
│   ├── sw.ts                           # Service worker (PWA)
│   ├── api/
│   │   ├── auth/
│   │   │   ├── session/route.ts        # POST: validate Magic DID token → mint session JWT
│   │   │   └── logout/route.ts         # POST: clear session cookie
│   │   ├── chat/route.ts               # AI chat endpoint
│   │   ├── activity/route.ts           # Activity CRUD
│   │   ├── activity/narrate/route.ts   # AI activity narration
│   │   ├── goals/route.ts              # Savings goals CRUD
│   │   ├── swap-quote/route.ts         # 0x swap quote proxy
│   │   └── voice/transcribe/route.ts   # Groq Whisper transcription
│   └── app/
│       ├── layout.tsx                  # Auth guard + chat bar
│       └── page.tsx                    # Dashboard (+ ConvertSheet)
├── components/
│   ├── auth/
│   │   └── login-email-modal.tsx       # Email OTP modal (Magic login)
│   ├── chat/                           # AI chat UI (6 components)
│   ├── dashboard/
│   │   ├── convert-sheet.tsx           # Cross-chain Convert via Particle UA
│   │   └── ...                        # Other sheets + overview (13 components)
│   ├── landing/                        # Landing page sections (6 components)
│   └── ui/                             # Shared UI components
├── contexts/                           # Chat + goals context providers
├── hooks/
│   ├── MagicProvider.tsx               # Magic SDK context (email OTP, EIP-7702)
│   ├── ZeroDevProvider.tsx             # ZeroDev kernel account (ERC-4337)
│   ├── UniversalAccountProvider.tsx    # Particle UA (cross-chain, EIP-7702)
│   ├── use-auth.ts                     # Privy-compatible adapter (useAuth, useLogout, useSmartWallets)
│   └── ...                            # Other hooks
├── lib/
│   ├── magic.ts                        # Magic SDK factory (EVMExtension, Base)
│   ├── magic-admin.ts                  # Server-side Magic Admin singleton
│   ├── session.ts                      # jose JWT sign/verify helpers
│   ├── auth.ts                         # API route auth guard (reads session cookie)
│   ├── wagmi.ts                        # Plain wagmi config (not @privy-io/wagmi)
│   ├── ai/                             # System prompt, tools, window messages
│   ├── db/                             # Drizzle client + schema (goals, activities)
│   ├── constants.ts                    # Vault config, token addresses, chain IDs
│   └── format.ts                       # USD, APY, shares formatters
├── providers/
│   └── index.tsx                       # Provider stack
└── types/
    └── particle-network-universal-account-sdk.d.ts  # Manual ambient type shim
```

## Getting started

### Prerequisites

- Node.js 20+
- Yarn (package manager)
- A [Magic](https://magic.link) app (publishable + secret key)
- A [ZeroDev](https://zerodev.app) project (bundler RPC, optional paymaster RPC)
- A [Particle Network](https://particle.network) project (project ID, client key, app ID)
- A [Neon](https://neon.tech) Postgres database

### Setup

```bash
git clone https://github.com/s0nderlabs/bottie.git
cd bottie
yarn install
```

Copy `.env.example` to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Side | Description |
|----------|------|-------------|
| `NEXT_PUBLIC_MAGIC_API_KEY` | Client | Magic publishable key |
| `MAGIC_SECRET_KEY` | Server only | Magic secret key (DID token validation) |
| `SESSION_JWT_SECRET` | Server only | Random secret for signing session JWTs (min 32 chars) |
| `NEXT_PUBLIC_ZERODEV_RPC_URL` | Client | ZeroDev bundler RPC URL |
| `NEXT_PUBLIC_ZERODEV_PAYMASTER_RPC_URL` | Client | ZeroDev paymaster RPC (optional, enables gas sponsorship) |
| `NEXT_PUBLIC_PARTICLE_PROJECT_ID` | Client | Particle Network project ID |
| `NEXT_PUBLIC_PARTICLE_CLIENT_KEY` | Client | Particle Network client key |
| `NEXT_PUBLIC_PARTICLE_APP_ID` | Client | Particle Network app ID |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Client | Alchemy API key for Base RPC |
| `DATABASE_URL` | Server only | Neon Postgres connection string |
| `DEEPSEEK_API_KEY` | Server only | DeepSeek API key for AI chat |
| `GROQ_API_KEY` | Server only | Groq API key for voice transcription |
| `ZERO_X_API_KEY` | Server only | 0x API key for swap quotes |
| `NEXT_PUBLIC_MOONPAY_API_KEY` | Client | MoonPay publishable key (widget) |
| `MOONPAY_SECRET_KEY` | Server only | MoonPay secret (signature generation) |

Run database migrations:

```bash
npx drizzle-kit push
```

Start the dev server:

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## EIP-7702 delegation flow

Particle Universal Account requires the Magic EOA to be delegated to UA's contract before cross-chain operations can run. This happens automatically the first time the user opens the Convert sheet:

1. `ensureDelegated()` checks `universalAccount.getEIP7702Deployments()` — if already delegated, skips.
2. Calls `universalAccount.getEIP7702Auth([chainId])` to get the authorization parameters.
3. Signs the authorization via `magic.wallet.sign7702Authorization({contractAddress, chainId, nonce})`.
4. Sends the delegation transaction via `magic.wallet.send7702Transaction({to, data, authorizationList})`.

> **Note:** Magic SDK cannot sign EIP-7702 authorizations with `chainId: 0` (chain-agnostic). The workaround is always passing a specific chain ID (8453 for Base). This is documented in `UniversalAccountProvider.tsx`.

## Database schema

**goals** — one savings goal per vault per user

| Column | Type |
|--------|------|
| id | uuid (PK) |
| userId | text |
| vaultId | text |
| name | text |
| targetAmount | numeric(28,18) |
| currency | text |
| createdAt | timestamp |

**activities** — on-chain transaction history

| Column | Type |
|--------|------|
| id | uuid (PK) |
| userId | text |
| type | text (deposit/withdraw/swap) |
| amount | text |
| tokenSymbol | text |
| vaultId | text (nullable) |
| txHash | text (nullable) |
| createdAt | timestamp |

## Openfort backend wallets + x402 agentic payments

Bottie uses **Openfort** and **x402** together to power its AI advisor with autonomous micro-payments — invisible to the end user.

### Architecture

```
User → Chat → AI advisor
                ↓
      calls get_premium_insights tool
                ↓
      server-side x402 paying client (x402-agent.ts)
      Openfort backend wallet signs ERC-3009 payment
                ↓
      /api/market-data  ← withX402 paywall (0.001 USDC)
      receives 402 → Openfort signs → retries → gets data
                ↓
      returns premium yield analytics to AI
```

### Openfort backend wallet

`src/lib/openfort.ts` — singleton Openfort client  
`src/lib/openfort-account.ts` — bridges Openfort's TEE-secured signing API to a viem `LocalAccount`:

- For each signing request, the EIP-712 hash is computed client-side with viem (`hashTypedData`)
- Only the hash is sent to Openfort's `/v2/accounts/backend/{id}/sign` endpoint
- The private key **never leaves Openfort's Trusted Execution Environment**

**Two uses of the backend wallet:**
1. **x402 payment client** — autonomously pays 0.001 USDC per premium data request via ERC-3009 `transferWithAuthorization`
2. **Goal achievement rewards** — sends 0.1 USDC bonus to users who hit a savings goal, triggered by the AI via the `award_goal_reward` tool

### x402 seller (paywall)

`src/app/api/market-data/route.ts` — premium yield analytics endpoint protected by `withX402` from `@x402/next`. Returns vault trend direction, risk scores, top pick, and live ETH/BTC prices.

`src/lib/x402-server.ts` — `x402ResourceServer` with `ExactEvmScheme` registered for `eip155:*`.

### x402 buyer (paying agent)

`src/lib/x402-agent.ts` — lazy singleton that:
1. Fetches the Openfort backend wallet address from the Openfort API
2. Creates a viem `LocalAccount` backed by `createOpenfortAccount()`
3. Registers `ExactEvmScheme(signer)` on an `x402Client`
4. Returns `wrapFetchWithPayment(fetch, client)` — a drop-in fetch replacement that auto-handles 402 responses

### AI tools added

| Tool | Type | Description |
|------|------|-------------|
| `get_premium_insights` | Server | Calls `/api/market-data` via x402; Openfort backend wallet auto-pays |
| `award_goal_reward` | Server | Sends 0.1 USDC to user via Openfort transaction intent when goal achieved |

### Setup

1. Create an account at [dashboard.openfort.io](https://dashboard.openfort.io)
2. Generate a **Secret Key** and **Wallet Secret**
3. Create a **Backend Wallet** — copy its `acc_*` ID as `OPENFORT_BACKEND_WALLET_ID`
4. Fund the backend wallet with a small amount of USDC on Base (for rewards + x402 payments)
5. Set `X402_PAYTO_ADDRESS` to any address you control on Base (receives 0.001 USDC per premium query)

## Migration from Privy

The following changes were made when migrating from Privy + wagmi to Magic + ZeroDev + Particle UA:

**Removed packages:**
- `@privy-io/react-auth`
- `@privy-io/server-auth`
- `@privy-io/wagmi`

**Added packages:**
- `magic-sdk@^33.7.1` — embedded wallet (email OTP, EIP-7702)
- `@magic-ext/evm@^1.3.0` — EVM extension for Magic (Base chain config, `switchChain`)
- `@magic-sdk/admin@^2.8.2` — server-side DID token validation
- `@zerodev/sdk@^5.5.10` — kernel account creation + client
- `@zerodev/ecdsa-validator@^5.4.9` — ECDSA signer → validator binding
- `permissionless@^0.3.6` — ERC-4337 types
- `@particle-network/universal-account-sdk@^1.1.1` — cross-chain UA
- `jose@^5.9.6` — JWT session management
- `ethers@^6.13.5` — BrowserProvider for personal_sign

**New files:**
- `src/lib/magic.ts` — Magic SDK factory
- `src/lib/magic-admin.ts` — server-side Magic Admin singleton
- `src/lib/session.ts` — jose JWT sign/verify
- `src/lib/auth.ts` — updated to read session cookie (was Privy server-auth)
- `src/lib/wagmi.ts` — updated import to plain `wagmi` (was `@privy-io/wagmi`)
- `src/hooks/MagicProvider.tsx` — Magic context + email modal state
- `src/hooks/ZeroDevProvider.tsx` — ZeroDev kernel account
- `src/hooks/UniversalAccountProvider.tsx` — Particle UA + EIP-7702 delegation
- `src/hooks/use-auth.ts` — Privy-compatible adapter hook
- `src/components/auth/login-email-modal.tsx` — email OTP input modal
- `src/components/dashboard/convert-sheet.tsx` — cross-chain Convert UI
- `src/app/api/auth/session/route.ts` — session cookie minting
- `src/app/api/auth/logout/route.ts` — session cookie deletion
- `src/types/particle-network-universal-account-sdk.d.ts` — manual type shim

**Modified files (import swaps only, no logic changes):**
- 16+ components/pages: `usePrivy` → `useAuth`, `useSmartWallets` → `useSmartWallets` (from `use-auth`)
- `src/providers/index.tsx` — replaced Privy provider tree with Magic/ZeroDev/UA tree
- `src/app/app/page.tsx` — added Convert sheet + MoonPay standalone URL

## Hackathon

Built for [Hack with YO: Designing Smart DeFi Savings](https://dorahacks.io/hackathon/yo/detail) on DoraHacks.

## License

MIT

---

Built by [Afoxcute](https://github.com/Afoxcute)
