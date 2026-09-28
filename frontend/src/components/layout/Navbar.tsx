import { Link, useLocation } from 'react-router-dom'
import { Factory, Moon, Search, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeProvider'
import { Button } from '@/components/ui/button'

const links = [
  { to: '/', label: 'Dashboard' },
  { to: '/so-lookup', label: 'SO Lookup' },
  { to: '/wo-lookup', label: 'WO Lookup' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const cycle = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const icon =
    theme === 'dark' ? (
      <Moon className="h-4 w-4" />
    ) : theme === 'light' ? (
      <Sun className="h-4 w-4" />
    ) : (
      <span className="text-xs font-medium leading-none">Auto</span>
    )

  const label =
    theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycle}
      className="gap-1.5 text-muted-foreground hover:text-foreground"
      aria-label={`Theme: ${label}. Click to cycle.`}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </Button>
  )
}

export default function Navbar() {
  const { pathname } = useLocation()

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center gap-4 px-6">
        <div className="flex items-center gap-2 font-semibold text-sm mr-4">
          <Factory className="h-5 w-5 text-primary" />
          <span>WO Scheduler</span>
        </div>
        <nav className="flex items-center gap-1">
          {links.map(l => (
            <Link
              key={l.to}
              to={l.to}
              className={cn(
                'px-3 py-1.5 text-sm rounded-md transition-colors',
                pathname === l.to
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              )}
            >
              {(l.to === '/so-lookup' || l.to === '/wo-lookup') ? (
                <span className="flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5" />
                  {l.label}
                </span>
              ) : l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
