![Sponsors](https://sponsors.amanv.dev/sponsors.png)

## 🚀 Simple Sponsor Management

Just 2 commands to manage everything:

### Core Commands

- **`pnpm sponsorkit`** - Run sponsorkit with automatic change tracking
- **`pnpm update-sponsors`** - Run sponsorkit + upload to R2

### Options

```bash
pnpm sponsorkit                 # Basic run with change diff
pnpm sponsorkit --table         # Show table after update  
pnpm sponsorkit --check         # Just check for changes (no update)
pnpm sponsorkit --offline       # Skip live exchange rate (faster)
pnpm sponsorkit --help          # Show help
```

### What You Get

- ✅ **Automatic diff tracking** - See new/removed/updated sponsors
- 💰 **Support summary** - Monthly vs one-time totals with changes
- 📊 **Clean table view** - Organized display with USD & INR amounts
- 🌐 **Live exchange rates** - Fetches current USD to INR rates from API
- 🔄 **Smart backups** - Auto-backup before each run
- 🚀 **One-click upload** - Process data and upload to R2

### Example Output

```
📊 SPONSOR CHANGES SUMMARY
📈 Total sponsors: 28 → 30

🎉 NEW SPONSORS (2):
  • John Doe (@johndoe) - $10/month (monthly)
  • Jane Smith (@janesmith) - $50 one time (one-time)

💰 SUPPORT SUMMARY:
Monthly: $200 → $220 (+20)
One-time total: $500 → $550 (+50)
```

That's it! No more juggling multiple scripts. 🎯
