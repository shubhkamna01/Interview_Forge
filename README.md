# Interview Forge

A frontend web application to help you organise interviews, built with **React 19**, **TypeScript** and **Vite**.


## Tech Stack

| Area            | Technology                         | Version   |
| --------------- | ---------------------------------- | --------- |
| UI library      | React and React DOM                | ^19.3.1   |
| Language        | TypeScript                         | ~6.0.3    |
| Build tool      | Vite                               | ^8.3.4    |
| React plugin    | @vitejs/plugin-react               | ^6.1.2    |
| Linting         | Oxlint                             | ^1.88.0   |
| Type definitions| @types/react, @types/react-dom, @types/node | see `package.json` |
| Package manager | npm                                |           |

## Project Structure

```
Interview_Forge-main/
├── frontend/                 # React + Vite application
│   ├── public/               # Static assets
│   ├── src/                  # Application source code
│   ├── index.html            # App entry HTML
│   ├── package.json          # Dependencies and scripts
│   ├── tsconfig.json         # TypeScript project references
│   ├── tsconfig.app.json     # TypeScript config for app code
│   ├── tsconfig.node.json    # TypeScript config for Vite/Node tooling
│   ├── vite.config.ts        # Vite configuration
│   └── .oxlintrc.json        # Linter rules
└── README.md
```

## Prerequisites

- [Node.js](https://nodejs.org/) **v20.19+** or **v22.12+** (required by recent Vite versions)
- npm (included with Node.js)

Check your versions:

```bash
node -v
npm -v
```

## Getting Started

> **Important:** the app lives in the `frontend` folder. Run all npm commands from there.

1. **Clone the repository**

   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
   ```

2. **Move into the frontend folder**

   ```bash
   cd frontend
   ```

3. **Install dependencies**

   ```bash
   npm install
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

5. Open the URL printed in the terminal (usually <http://localhost:5173>).

## Available Scripts

Run these from the `frontend` directory:

| Command           | What it does                                          |
| ----------------- | ----------------------------------------------------- |
| `npm run dev`     | Starts the Vite dev server with HMR                   |
| `npm run build`   | Type-checks with `tsc -b`, then builds with Vite      |
| `npm run lint`    | Lints the project with Oxlint                         |
| `npm run preview` | Serves the production build locally for a final check |

The production build is written to `frontend/dist/`.

## Configuration

- **TypeScript:** `tsconfig.app.json` targets ES2023 and uses bundler mode (`moduleResolution: bundler`, `verbatimModuleSyntax`, `noUnusedLocals`, `noUnusedParameters`).
- **Vite:** customise the dev server and build in `vite.config.ts`.
- **Linting:** rules live in `.oxlintrc.json`.
- **Environment variables:** TODO. If needed, create `frontend/.env` and prefix variables with `VITE_`:

  ```env
  VITE_API_URL=http://localhost:5000
  ```

## Troubleshooting

### `npm error enoent: Could not read package.json`

npm was run in a folder without a `package.json`. Go into `frontend` first:

```bash
cd frontend
npm install
npm run dev
```

### Nested folder after unzipping (Windows)

Downloaded ZIPs sometimes extract as `Interview_Forge-main\Interview_Forge-main`. Make sure you `cd` into the folder that directly contains `frontend/`.

### Dependency or version errors

Check that your Node version meets the prerequisites, then reinstall:

```powershell
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "Add my feature"`
4. Push the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## License

TODO: add a license (for example MIT) and a `LICENSE` file.
