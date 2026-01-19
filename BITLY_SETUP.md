# Bitly Setup Instructions

## Steps to get your free Bitly API token:

1. **Sign up for free Bitly account:**
   - Go to: https://bitly.com/a/sign_up
   - Create a free account (no credit card required)

2. **Generate your API token:**
   - After logging in, go to: https://app.bitly.com/settings/api/
   - Click "Generate Token"
   - Copy the token (it looks like: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0`)

3. **Add token to your .env file:**
   - Open the `.env` file in the root of your project
   - Replace `your_bitly_token_here` with your actual token:

   ```
   VITE_BITLY_ACCESS_TOKEN=your_actual_token_here
   ```

4. **Restart your development server:**
   - Stop the current dev server (Ctrl+C)
   - Run `npm run dev` again

5. **Test it:**
   - Log in as admin
   - Go to any event page
   - Click "Lag kort lenke" button
   - The shortened link will be created and copied to clipboard!

## Free tier limits:

- 50 shortened URLs per month
- No preview pages
- Links never expire
- Analytics included

## Notes:

- The `.env` file is already in `.gitignore` so your token won't be committed to git
- Each event will create one short link that can be reused
- Short links look like: `bit.ly/abc123`
