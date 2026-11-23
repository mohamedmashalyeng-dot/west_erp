import nextEnv from "@next/env";

// Use the same precedence as Next.js, including .env.local. Existing process
// variables from the hosting provider or test runner always take precedence.
nextEnv.loadEnvConfig(process.cwd());
