# Astra

Astra is a full-stack AI-powered study companion built with React, Tailwind CSS, Vercel Serverless Functions, and Google Gemini.

## Features

- Upload a PDF or image and extract study text.
- Generate structured notes with Gemini.
- Create MCQ quizzes with explanations.
- Turn content and missed quiz questions into spaced-repetition flashcards.
- Track topics, accuracy, weak questions, and cards due in a dashboard.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add your Gemini key:

   ```bash
   cp .env.example .env.local
   ```

   Then set `GEMINI_API_KEY`.

3. Run the frontend:

   ```bash
   npm run dev
   ```

For full local API behavior, run with Vercel:

```bash
npm run dev:vercel
```

## Deployment

Deploy on Vercel and add `GEMINI_API_KEY` in Project Settings → Environment Variables. The key is only used in serverless functions and is never exposed to the browser.
