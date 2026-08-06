# Quorum Nexus - Rewards on Steroids 🚀

The ultimate platform to consolidate, track, and maximize your credit card rewards across 15+ banks and 57+ loyalty programs.

## 🎯 Vision

Stop letting your rewards scatter across multiple apps and platforms. Quorum Nexus brings everything together—your credit cards, loyalty programs, and voucher redemptions—into one powerful, beautiful interface.

**Features:**
- 💳 15+ credit card integrations
- 🎁 57+ loyalty program connections
- 🔀 155+ optimized transfer routes
- 🎫 5 major voucher partners
- 📊 Real-time points tracking
- 🔐 Bank-grade security
- 📱 Mobile-responsive design

## 🏗️ Architecture

### Tech Stack

**Frontend**: Next.js 14+, React 18+, TypeScript, Tailwind CSS, Zustand  
**Backend**: Supabase (PostgreSQL, Auth, Realtime)  
**Hosting**: Vercel (Serverless, Edge Functions, CDN)  

## 📁 Project Structure

```
quorum-nexus/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── auth/              # Authentication flows
│   ├── dashboard/         # Main dashboard
│   ├── cards/             # Cards portfolio
│   ├── transfer/          # Transfer wizard
│   └── vouchers/          # Redemption center
├── components/            # Reusable React components
├── lib/                   # Core utilities & config
│   ├── supabase.ts        # Supabase client
│   ├── auth-context.tsx   # Auth provider
│   ├── store.ts           # Zustand state
│   └── api.ts             # API functions
└── public/                # Static assets
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ (LTS)
- Git
- Supabase account
- Vercel account

### Local Development

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
# Add your Supabase credentials

# Run dev server
npm run dev

# Open browser to http://localhost:3000
```

### Deploy to Vercel

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) for step-by-step instructions.

## ✨ Key Features

### 🔐 Authentication
- Email/password signup & login
- Google OAuth integration
- GitHub OAuth integration
- Session management
- Protected routes

### 📊 Dashboard
- Aggregated points tracking
- Portfolio overview
- Quick action buttons
- Real-time data sync

### 💳 Cards Management
- Linked credit cards
- Points per card
- Rewards rates
- Transfer shortcuts

### 🔀 Transfer Wizard
- Multi-step transfer flow
- Card → Program mapping
- Amount validation
- Success confirmation

### 🎫 Voucher Redemption
- 5+ partner vouchers
- Points requirement display
- 1-click redemption
- Balance tracking

## 📖 API Integration

### Supabase Connection
All data synced via Supabase REST API:
- User authentication
- Card management
- Loyalty programs
- Transfer history
- Redemption tracking

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=https://[your-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
NEXT_PUBLIC_APP_URL=http://localhost:3000 (or production URL)
```

## 🎨 Design System

**Colors**: Indigo → Purple → Pink gradients  
**Typography**: Bold sans-serif headers, readable body text  
**Components**: Card-based, glassmorphism effects, smooth animations  
**Responsive**: Mobile-first, optimized for all screen sizes  

## 🔐 Security

✅ Supabase Auth for all user management  
✅ Row-Level Security (RLS) on database  
✅ Secure OAuth with Google & GitHub  
✅ Environment variables encrypted  
✅ HTTPS enforced on production  
✅ No sensitive data in localStorage  

## 📱 Browser Support

- Chrome/Edge (latest)
- Safari (latest)
- Firefox (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 🧪 Testing

Run on:
- Desktop (1920x1080, 1440x900)
- Tablet (768x1024)
- Mobile (375x667, 414x896)

## 📚 Documentation

- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Vercel deployment steps
- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Tailwind Docs](https://tailwindcss.com/docs)

## 🐛 Troubleshooting

**Issue**: "Invalid redirect URI"  
**Fix**: Add your Vercel URL to Supabase OAuth callbacks

**Issue**: User data not loading  
**Fix**: Verify NEXT_PUBLIC_SUPABASE_ANON_KEY is correct

**Issue**: Build fails  
**Fix**: Check Vercel logs, verify all env vars are set

See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md#-troubleshooting) for more.

## 🚀 Deployment Status

- ✅ Frontend built & tested
- ✅ Authentication ready
- ✅ Supabase integrated
- ✅ Ready for Vercel deployment

Follow [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) to go live!

## 💰 Cost

| Service | Tier | Cost |
|---------|------|------|
| Supabase | Free | $0 |
| Vercel | Hobby | $0 |
| **Total** | | **$0** |

## 📄 License

MIT License

## 🎉 Built With

- [Next.js](https://nextjs.org/) - React framework
- [Supabase](https://supabase.com/) - Backend platform
- [Vercel](https://vercel.com/) - Hosting
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Zustand](https://github.com/pmndrs/zustand) - State management
- [Lucide Icons](https://lucide.dev/) - Icons

---

**Status**: ✅ Production Ready (Day 2)  
**Version**: 1.0.0  
**Rewards**: On Steroids 🚀
