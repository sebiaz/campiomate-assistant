# CampioMate Assistant

A local browser automation tool to help solve exercises on [CampioMate.ro](https://campiomate.ro) - the Romanian national team mathematics competition platform.

## Features

- 🔍 **Exercise Detection** - Automatically detects exercise type (multiple choice, numeric, fraction, boolean, text)
- 🧠 **Local Solving** - Built-in heuristics for common math problem types (sum, difference, product, division, fractions, true/false)
- 🤖 **AI Integration Ready** - Optional OpenAI integration for complex problems
- 👁️ **Review Before Submit** - Default mode requires manual confirmation before submitting any answer
- 📝 **History Tracking** - Records all attempts, submissions, and results locally
- 🛡️ **Safe by Default** - Dry-run mode, no auto-submit unless explicitly enabled
- 🪟 **Windows Native** - Tested on Windows 11 with PowerShell

## Requirements

- **Node.js 18+** - [Download here](https://nodejs.org/)
- **Windows 10/11** (PowerShell)
- **CampioMate account** - Required to access exercises

## Installation

```powershell
# Clone or navigate to project directory
cd campiomate-assistant

# Install dependencies
npm install

# Install Playwright Chromium
npx playwright install chromium
```

## Configuration

1. Copy the example config:
```powershell
copy config.example.json config.json
```

2. Edit `config.json` to customize:
   - `autoSubmit: false` - **Never** submit automatically (default: false)
   - `dryRun: true` - Test without submitting (default: false)
   - `browser.headless: false` - Show browser window (default: false)
   - `ai.enabled: true` - Enable AI solving (requires `OPENAI_API_KEY` env var)

3. For AI support, set your API key:
```powershell
$env:OPENAI_API_KEY = "your-key-here"
# Or add to Windows Environment Variables permanently
```

## Usage

### Basic Commands

```powershell
# Start interactive mode (default)
npm start

# Dry run - test without submitting
npm run dry-run

# Auto-submit mode (USE WITH CAUTION)
npm start -- --auto-submit

# Headless mode
npm start -- --headless

# Run tests
npm test
```

### Interactive Menu

On startup, you'll see:

```
1. Start solving exercises (requires login)
2. Browse training catalog (no login needed)
3. View exercise history
4. Settings
5. Exit
```

### Exercise Solving Flow

1. **Select option 1** - Opens training page
2. **Log in manually** in the browser window when prompted
3. **Assistant detects exercises** from the filtered table
4. **For each exercise**:
   - Opens the exercise page
   - Detects question type and content
   - Attempts local solving
   - **Shows proposed answer with confidence**
   - **Waits for your review** (submit / edit / skip / quit)
5. **Returns to catalog** for next exercise

### Confidence Levels

- 🟢 **HIGH** (≥80%) - Answer found with high confidence
- 🟡 **UNCERTAIN** (50-79%) - Answer uncertain, verify carefully
- 🔴 **UNABLE** (<50%) - Unable to solve reliably

## Safety Features

| Feature | Default | Description |
|---------|---------|-------------|
| Review before submit | ✅ Enforced | Never auto-submits without confirmation |
| Dry-run mode | Available | Test without any submissions |
| Auto-submit | ❌ Disabled | Must be explicitly enabled via CLI |
| History tracking | ✅ Enabled | Local JSON files, no cloud sync |
| No credentials stored | ✅ Guaranteed | Uses env vars only |

## Project Structure

```
campiomate-assistant/
├── config.example.json    # Configuration template
├── config.json            # Your config (gitignored)
├── package.json
├── jest.config.js
├── README.md
├── src/
│   ├── index.js           # Main entry point
│   ├── config.js          # Config loader
│   ├── logger.js          # Winston logger
│   ├── browser.js         # Playwright wrapper
│   ├── exercise-detector.js  # Question detection
│   ├── answer-extractor.js   # Local solving logic
│   ├── ui.js              # CLI prompts
│   └── history.js         # Session/history tracking
├── tests/
│   └── answer-extractor.test.js
└── data/                  # Created at runtime
    ├── history.json       # Global exercise history
    └── session_*.json     # Per-session logs
```

## What Works (Verified)

- ✅ Training catalog browsing (no login)
- ✅ Exercise list extraction with filters (grade, division, round)
- ✅ Exercise page navigation
- ✅ Question type detection (via answer icons)
- ✅ Local solving for: boolean, numeric (sum/diff/product/div), fractions, multiple choice
- ✅ Review-before-submit CLI interface
- ✅ History tracking (local JSON)
- ✅ Dry-run mode
- ✅ Graceful error handling

## Limitations

- ❌ **Requires manual login** - Cannot bypass authentication
- ❌ **Cannot access exercise content without login** - Exercise pages show minimal content when not authenticated
- ❌ **Local solving is heuristic-based** - Only handles simple math patterns
- ❌ **No CAPTCHA handling** - Will pause for manual intervention
- ❌ **Selectors may break** - Site updates could require selector updates
- ❌ **No WebSocket/real-time support** - Static page scraping only

## How to Enable/Disable Auto-Submit

**Enable (temporary):**
```powershell
npm start -- --auto-submit
```

**Enable (persistent - edit config.json):**
```json
{
  "autoSubmit": true
}
```

**Disable (default):**
```json
{
  "autoSubmit": false
}
```

Or via environment variable:
```powershell
$env:CAMPIO_AUTO_SUBMIT = "false"
```

## Troubleshooting

### Browser doesn't open
```powershell
npx playwright install chromium
```

### Selectors not working
- Site may have updated - check browser dev tools
- Update selectors in `config.json`

### Login issues
- Complete CAPTCHA manually in browser window
- Wait for "Press Enter when logged in" prompt

### Permission errors
```powershell
# Run PowerShell as Administrator if needed
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Privacy & Security

- **No data leaves your machine** except to CampioMate.ro
- **No credentials stored** - Uses browser session cookies only
- **API keys via env vars only** - Never in config files
- **Local history only** - JSON files in `data/` directory
- **Open source** - Audit the code yourself

## License

MIT License - Use at your own risk. Not affiliated with CampioMate.

## Disclaimer

This tool is for **educational assistance only**. Always verify answers before submitting. The authors are not responsible for incorrect submissions or any consequences of using this tool. Respect CampioMate's terms of service and robots.txt.