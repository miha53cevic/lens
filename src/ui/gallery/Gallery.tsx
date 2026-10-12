import { useState, type ReactNode } from 'react';
import { GitPullRequest, MessageSquare, MoreHorizontal, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Brand } from '../Brand.tsx';
import { Button } from '../Button.tsx';
import { Chip } from '../Chip.tsx';
import { CopyCommand } from '../CopyCommand.tsx';
import { Field } from '../Field.tsx';
import { StatusBadge, StatusLetter, type FileStatus } from '../FileStatus.tsx';
import { IconButton } from '../IconButton.tsx';
import { Kbd } from '../Kbd.tsx';
import { Menu, MenuItem, MenuSection, MenuSeparator, MenuSwitch } from '../Menu.tsx';
import { ProgressRing } from '../ProgressRing.tsx';
import { ReviewSkeleton } from '../ReviewSkeleton.tsx';
import { Segmented } from '../Segmented.tsx';
import { Skeleton } from '../Skeleton.tsx';
import { Stepper } from '../Stepper.tsx';
import { StatusBar } from '../StatusBar.tsx';
import { Swatch } from '../Swatch.tsx';
import { ThemeMenu } from '../ThemeMenu.tsx';
import { TopBar, TopBarDivider } from '../TopBar.tsx';
import './style.css';

/** The two code themes a mock is shown in: the tokens' inputs, as the viewer's payload gives them. */
const THEMES = {
  vesper: { bg: '#101010', fg: '#ffffff', accent: '#ffc799', appearance: 'dark' },
  'github-light': { bg: '#ffffff', fg: '#24292e', accent: '#6f42c1', appearance: 'light' },
} as const;
type ThemeName = keyof typeof THEMES;

const STATUSES: FileStatus[] = ['added', 'modified', 'deleted', 'renamed', 'excluded'];
const TEXT_STEPS = ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl'];
const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8];
const SURFACES = ['bg', 'surface', 'surface-2', 'raised', 'selected-bg', 'accent', 'add', 'mod', 'del', 'danger'];

function applyTheme(name: ThemeName) {
  const theme = THEMES[name];
  const root = document.documentElement;
  root.style.setProperty('--code-bg', theme.bg);
  root.style.setProperty('--code-fg', theme.fg);
  root.style.setProperty('--theme-accent', theme.accent);
  root.dataset.appearance = theme.appearance;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className='gallery-section' id={id}>
      <h2>{title}</h2>
      <div className='gallery-row'>{children}</div>
    </section>
  );
}

export function Gallery() {
  const [theme, setTheme] = useState<ThemeName>('vesper');
  const [view, setView] = useState('code');
  const [level, setLevel] = useState(1);
  const [size, setSize] = useState(12);
  const [chips, setChips] = useState({ logging: true, imports: false, word: true });
  const [pressed, setPressed] = useState(true);
  const [wordDiff, setWordDiff] = useState(true);
  const [query, setQuery] = useState('orders');

  return (
    <main className='gallery'>
      <header className='gallery-head'>
        <h1>lens design system</h1>
        <Segmented
          id='gallery-theme'
          label='code theme'
          size='lg'
          options={[
            { value: 'vesper', label: 'vesper' },
            { value: 'github-light', label: 'github-light' },
          ]}
          value={theme}
          onChange={(name) => {
            applyTheme(name);
            setTheme(name);
          }}
        />
      </header>

      <Section id='g-button' title='Button'>
        <Button>Default</Button>
        <Button variant='ghost'>Ghost</Button>
        <Button variant='primary'>Primary</Button>
        <Button disabled>Disabled</Button>
        <Button size='sm'>
          <RefreshCw size={12} /> Small
        </Button>
        <Button size='sm' aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
          Pressed
        </Button>
        <Button shortcut='r' tip='Refresh' tipSide='start'>
          With a key
        </Button>
      </Section>

      <Section id='g-icon-button' title='IconButton'>
        <IconButton label='Refresh' shortcut='r' tipSide='start'>
          <RefreshCw size={15} />
        </IconButton>
        <IconButton label='Ask' aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
          <MessageSquare size={15} />
        </IconButton>
        <IconButton label='Disabled' disabled>
          <RefreshCw size={15} />
        </IconButton>
        <IconButton label='close' size='sm'>
          <X size={12} />
        </IconButton>
      </Section>

      <Section id='g-segmented' title='Segmented'>
        <Segmented
          label='fold level'
          options={[0, 1, 2, 3].map((value) => ({ value, label: String(value) }))}
          value={level}
          onChange={setLevel}
        />
        <Segmented
          label='view'
          size='lg'
          options={[
            { value: 'code', label: 'Code' },
            { value: 'summary', label: 'Summary', badge: <span className='dot' /> },
          ]}
          value={view}
          onChange={setView}
        />
      </Section>

      <Section id='g-stepper' title='Stepper'>
        <Stepper
          label='code size'
          value={size + 'px'}
          lessLabel='Smaller'
          moreLabel='Larger'
          atMin={size === 10}
          atMax={size === 14}
          onStep={(delta) => setSize(size + delta)}
        />
        <Stepper label='at its end' value='24px' lessLabel='Smaller' moreLabel='Larger' atMax onStep={() => {}} />
      </Section>

      <Section id='g-chip' title='Chip'>
        <Chip color='#8fb3ff' checked={chips.logging} onChange={(logging) => setChips({ ...chips, logging })}>
          logging
        </Chip>
        <Chip color='#c4a5ff' checked={chips.imports} onChange={(imports) => setChips({ ...chips, imports })}>
          imports
        </Chip>
        <Chip checked={chips.word} onChange={(word) => setChips({ ...chips, word })}>
          word
        </Chip>
      </Section>

      <Section id='g-field' title='Field'>
        <Field size='sm' mono placeholder='HEAD~3 -- src/' aria-label='small' />
        <Field
          icon={<Search size={13} />}
          placeholder='Filter files'
          aria-label='medium'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
        />
        <Field size='lg' icon={<GitPullRequest size={16} />} placeholder='A number, or a PR URL' aria-label='large' />
      </Section>

      <Section id='g-menu' title='Menu'>
        <Menu label='More' trigger={<MoreHorizontal size={16} />}>
          <MenuSection title='Show'>
            <MenuSwitch shortcut='w' checked={wordDiff} onChange={setWordDiff}>
              Word diff
            </MenuSwitch>
          </MenuSection>
          <MenuSeparator />
          <MenuItem icon={<RefreshCw size={14} />} shortcut='r' onSelect={() => {}}>
            Refresh
          </MenuItem>
          <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => {}}>
            Stop the server
          </MenuItem>
        </Menu>
        <ThemeMenu
          theme={theme}
          themes={Object.entries(THEMES).map(([name, colors]) => ({ name, ...colors }))}
          onPick={(name) => {
            applyTheme(name as ThemeName);
            setTheme(name as ThemeName);
          }}
        />
      </Section>

      <Section id='g-status' title='FileStatus'>
        {STATUSES.map((status) => (
          <StatusLetter key={status} status={status} />
        ))}
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </Section>

      <Section id='g-kbd' title='Kbd, CopyCommand, ProgressRing, dot'>
        <Kbd combo='⌘P' />
        <Kbd combo='Ctrl P' />
        <Kbd combo='⌥ click' />
        <CopyCommand command='/lens-review' />
        <ProgressRing done={3} total={8} label='files viewed' />
        <span className='dot' />
      </Section>

      <section className='gallery-section' id='g-bars'>
        <h2>TopBar, Brand, Swatch, StatusBar</h2>
        <div className='gallery-bars'>
          <TopBar>
            <Brand />
            <TopBarDivider />
            <Swatch />
            <Swatch bg='#ffffff' accent='#6f42c1' />
          </TopBar>
          <StatusBar
            status={{
              kind: 'failed',
              label: 'Refresh failed',
              detail: 'git exited with 128',
              action: { label: 'Dismiss', run: () => {} },
            }}
            notices={[
              { id: 'stale', text: '2 summaries are stale', tone: 'warn', run: () => {} },
              { id: 'agent', text: 'Agent listening', tone: 'live' },
              { id: 'git', text: 'git 2.47.1', tone: 'plain' },
            ]}
          />
        </div>
      </section>

      <Section id='g-skeleton' title='Skeleton'>
        <div className='gallery-skeleton-lines'>
          <Skeleton width='14ch' />
          <Skeleton width='22ch' />
          <Skeleton width='9ch' />
        </div>
        <Skeleton size='icon' />
        <Skeleton size='sm' width='160px' />
        <Skeleton size='md' width='160px' />
        <Skeleton size='xs' round width='72px' />
        <Skeleton size='lg' round width='168px' />
      </Section>

      <section className='gallery-section' id='g-review-skeleton'>
        <h2>ReviewSkeleton</h2>
        <div className='gallery-review-skeleton'>
          <ReviewSkeleton />
        </div>
      </section>

      <Section id='g-type' title='Type scale'>
        {TEXT_STEPS.map((step) => (
          <span key={step} style={{ fontSize: `var(--text-${step})` }}>
            {step}
          </span>
        ))}
        <code style={{ fontSize: 'var(--text-code)' }}>code</code>
      </Section>

      <Section id='g-space' title='Space scale'>
        {SPACE_STEPS.map((step) => (
          <span
            key={step}
            className='gallery-space'
            style={{ width: `var(--space-${step})` }}
            title={'--space-' + step}
          />
        ))}
      </Section>

      <Section id='g-color' title='Surfaces and colors'>
        {SURFACES.map((name) => (
          <span key={name} className='gallery-swatch'>
            <i style={{ background: `var(--${name})` }} />
            {name}
          </span>
        ))}
      </Section>

      <Section id='g-elevation' title='Elevation'>
        {[1, 2, 3].map((step) => (
          <span key={step} className='gallery-lift' style={{ boxShadow: `var(--elev-${step})` }}>
            elev-{step}
          </span>
        ))}
      </Section>
    </main>
  );
}
