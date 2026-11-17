import { useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  Folder,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Brand } from '../Brand.tsx';
import { Button } from '../Button.tsx';
import { Choice, ChoiceList } from '../Choice.tsx';
import { Chip } from '../Chip.tsx';
import { CopyCommand } from '../CopyCommand.tsx';
import { CrashPanel } from '../ErrorBoundary.tsx';
import { Disclosure } from '../Disclosure.tsx';
import { Field } from '../Field.tsx';
import { StatusBadge, StatusLetter, type FileStatus } from '../FileStatus.tsx';
import { HoverCard, type HoverAnchor } from '../HoverCard.tsx';
import { IconButton } from '../IconButton.tsx';
import { Kbd } from '../Kbd.tsx';
import { ListRow } from '../ListRow.tsx';
import { Menu, MenuItem, MenuSection, MenuSeparator, MenuSwitch } from '../Menu.tsx';
import { ProgressRing } from '../ProgressRing.tsx';
import { ReviewSkeleton } from '../ReviewSkeleton.tsx';
import { Segmented } from '../Segmented.tsx';
import { Select } from '../Select.tsx';
import { Skeleton } from '../Skeleton.tsx';
import { Spinner } from '../Spinner.tsx';
import { Stepper } from '../Stepper.tsx';
import { Switch } from '../Switch.tsx';
import { StatusBar } from '../StatusBar.tsx';
import { Swatch } from '../Swatch.tsx';
import { Tab, TAB_BUTTON } from '../Tab.tsx';
import { Tag } from '../Tag.tsx';
import { TextArea } from '../TextArea.tsx';
import { ThemeMenu } from '../ThemeMenu.tsx';
import { TopBar, TopBarDivider } from '../TopBar.tsx';
import { tipAttrs } from '../Tip.tsx';

/** Two code themes for the theme menu to list: the page itself is in the theme of the page that shows it. */
const THEMES = {
  vesper: { bg: '#101010', accent: '#ffc799' },
  'github-light': { bg: '#ffffff', accent: '#6f42c1' },
} as const;
type ThemeName = keyof typeof THEMES;

const STATUSES: FileStatus[] = ['added', 'modified', 'deleted', 'renamed', 'excluded'];
const TEXT_STEPS = ['2xs', 'xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl'];
const SPACE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8];
const SURFACES = ['bg', 'surface', 'surface-2', 'raised', 'selected-bg', 'accent', 'add', 'mod', 'del', 'danger'];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className='mt-6' id={id}>
      <h2 className='eyebrow m-0 mb-2'>{title}</h2>
      <div className='flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-4'>{children}</div>
    </section>
  );
}

/**
 * The design system's sandbox: every primitive of ui/ and its states. It is where a new control is
 * looked at before it is used, and what a mock is checked against. The desktop app shows it in a
 * tab (Settings → Sandbox), in the app's code theme: switch that to see it dark and light.
 */
export function Sandbox() {
  const [theme, setTheme] = useState<ThemeName>('vesper');
  const [view, setView] = useState('code');
  const [segFilter, setSegFilter] = useState('all');
  const [level, setLevel] = useState(1);
  const [size, setSize] = useState(12);
  const [chips, setChips] = useState({ logging: true, imports: false, word: true });
  const [range, setRange] = useState('staged');
  const [tab, setTab] = useState(0);
  const [row, setRow] = useState(1);
  const [filter, setFilter] = useState(true);
  const [branch, setBranch] = useState('main');
  const [draft, setDraft] = useState('');
  const [ticks, setTicks] = useState({ summaries: true, marks: false });
  const [pressed, setPressed] = useState(true);
  const [wordDiff, setWordDiff] = useState(true);
  const [query, setQuery] = useState('orders');
  const [disclosed, setDisclosed] = useState(true);
  const [switched, setSwitched] = useState(true);

  return (
    <main className='min-h-0 flex-1 overflow-y-auto px-7 pt-6 pb-8'>
      <header className='flex items-center justify-between gap-4'>
        <h1 className='m-0 font-serif text-xl font-bold'>Sandbox</h1>
      </header>

      <Section id='g-button' title='Button'>
        <Button>Default</Button>
        <Button variant='ghost'>Ghost</Button>
        <Button variant='primary'>Primary</Button>
        <Button variant='danger'>Danger</Button>
        <Button disabled>Disabled</Button>
        <Button size='sm'>
          <RefreshCw size={12} /> Small
        </Button>
        <Button size='sm' aria-pressed={pressed} onClick={() => setPressed(!pressed)}>
          Pressed
        </Button>
        <Button size='xs'>Extra small</Button>
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
        <div className='w-[260px]'>
          <Segmented
            label='filter'
            fill
            options={['all', 'bugs', 'risks'].map((value) => ({ value, label: value }))}
            value={segFilter}
            onChange={(value) => setSegFilter(segFilter === value ? '' : value)}
          />
        </div>
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

      <Section id='g-switch' title='Switch'>
        <Switch label='word diff' checked={switched} onChange={setSwitched} />
        <Switch label='off' checked={false} onChange={() => {}} />
        <Switch label='decided by another setting' checked disabled onChange={() => {}} />
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

      <Section id='g-choice' title='Choice'>
        <ChoiceList type='radio' label='Changes'>
          {['worktree', 'staged'].map((value) => (
            <Choice
              key={value}
              type='radio'
              name='sandbox-range'
              checked={range === value}
              onChange={() => setRange(value)}
              label={value === 'worktree' ? 'Working tree' : 'Staged'}
              hint={value === 'worktree' ? "Changes you haven't staged" : 'What the next commit would take'}
              meta={value === 'worktree' ? '3 files' : '1 file'}
            />
          ))}
          <Choice type='radio' name='sandbox-range' checked={false} disabled onChange={() => {}} label='Disabled' />
        </ChoiceList>
        <ChoiceList type='checkbox' label='What to clear'>
          <Choice
            type='checkbox'
            checked={ticks.summaries}
            onChange={(summaries) => setTicks({ ...ticks, summaries })}
            label='Summaries'
            hint='3 reviews'
          />
          <Choice
            type='checkbox'
            checked={ticks.marks}
            onChange={(marks) => setTicks({ ...ticks, marks })}
            label='Viewed and concern marks'
            hint='12 marks · in this browser'
          />
        </ChoiceList>
      </Section>

      <Section id='g-tag' title='Tag'>
        <Tag>component</Tag>
        <Tag icon={<GitBranch size={11} />}>feature-x</Tag>
        <Tag mono color='var(--question)'>
          src/orders.ts:10
        </Tag>
        <Tag dot='var(--add)'>added</Tag>
        <Tag mono dot='var(--mod)' onClick={() => {}}>
          findOrders
        </Tag>
        <Tag pressed={filter} onClick={() => setFilter(!filter)}>
          all flagged
        </Tag>
      </Section>

      <Section id='g-tab' title='Tab'>
        <div className='flex gap-1' role='tablist'>
          {['orders.ts', 'report.ts'].map((name, tabIndex) => (
            <Tab
              key={name}
              mono
              active={tab === tabIndex}
              onSelect={() => setTab(tabIndex)}
              onClose={() => {}}
              closeLabel={'Close ' + name}
            >
              <StatusLetter status='modified' />
              {name}
            </Tab>
          ))}
          <Tab
            active={false}
            floatButtons
            onSelect={() => {}}
            onClose={() => {}}
            closeLabel='Close lens'
            actions={
              <IconButton size='sm' className={TAB_BUTTON} label="Change what's reviewed">
                <ArrowLeftRight size={12} />
              </IconButton>
            }
          >
            <Folder size={13} />
            lens
          </Tab>
        </div>
      </Section>

      <Section id='g-list-row' title='ListRow'>
        <div className='grid w-[260px] gap-1 font-mono text-sm [&>button]:px-2 [&>button]:py-1 [&>button]:font-mono [&>button]:text-sm'>
          {['src/orders.ts', 'src/report.ts', 'src/types.ts'].map((path, rowIndex) => (
            <ListRow key={path} selected={row === rowIndex} onClick={() => setRow(rowIndex)}>
              {path}
            </ListRow>
          ))}
        </div>
      </Section>

      <Section id='g-disclosure' title='Disclosure'>
        <div className='grid w-[260px] gap-1 font-mono text-sm [&>button]:px-2 [&>button]:py-1 [&>button]:font-mono [&>button]:text-sm'>
          <Disclosure open={disclosed} onClick={() => setDisclosed(!disclosed)}>
            src/orders.ts:42
          </Disclosure>
          {disclosed && <div className='px-6 text-sm text-faint'>what it shows, under it</div>}
          <Disclosure open={false} disabled>
            dismissed: it stays shut
          </Disclosure>
        </div>
      </Section>

      <Section id='g-select' title='Select'>
        <Select label='branch' value={branch} options={['main', 'develop', 'release/2.0']} onChange={setBranch} />
        <Select label='disabled' value='main' options={['main']} onChange={() => {}} disabled />
      </Section>

      <Section id='g-textarea' title='TextArea'>
        <TextArea
          className='w-[360px]'
          rows={2}
          aria-label='a question'
          placeholder='Ask about findOrders…'
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </Section>

      <Section id='g-field' title='Field'>
        <Field className='w-[240px]' size='sm' mono placeholder='HEAD~3 -- src/' aria-label='small' />
        <Field
          className='w-[240px]'
          icon={<Search size={13} />}
          placeholder='Filter files'
          aria-label='medium'
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery('')}
        />
        <Field
          className='w-[240px]'
          size='lg'
          icon={<GitPullRequest size={16} />}
          placeholder='A number, or a PR URL'
          aria-label='large'
        />
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
          onPick={(name) => setTheme(name as ThemeName)}
        />
      </Section>

      <Section id='g-hover-card' title='HoverCard'>
        <HoverTarget />
      </Section>

      <Section id='g-tooltip' title='Tooltip'>
        <span className='text-sm text-muted' {...tipAttrs('Says more than the text does')}>
          Hover me
        </span>
        <span
          className='max-w-[160px] overflow-hidden font-mono text-sm text-ellipsis whitespace-nowrap text-muted'
          {...tipAttrs('src/viewer/components/Nav/Tree/FileRow.tsx', { cut: true })}
        >
          src/viewer/components/Nav/Tree/FileRow.tsx
        </span>
        <span className='font-mono text-sm text-muted' {...tipAttrs('src/short.ts', { cut: true })}>
          src/short.ts
        </span>
      </Section>

      <Section id='g-status' title='FileStatus'>
        {STATUSES.map((status) => (
          <StatusLetter key={status} status={status} />
        ))}
        {STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </Section>

      <Section id='g-kbd' title='Kbd, CopyCommand, ProgressRing, Spinner, dot'>
        <Kbd combo='⌘P' />
        <Kbd combo='Ctrl P' />
        <Kbd combo='⌥ click' />
        <Kbd combo='⌘ ↵' size='sm' />
        <Button variant='primary' size='sm'>
          Open <Kbd combo='⌘ ↵' />
        </Button>
        <CopyCommand command='/lens-review' />
        <div className='w-[320px]'>
          <CopyCommand
            block
            wrap
            command="/lavish add a cache to the search endpoint. Open it with lavish-axi's --no-open: I'm reviewing it in lens."
          />
        </div>
        <ProgressRing done={3} total={8} label='files viewed' />
        <Spinner />
        <span className='dot' />
      </Section>

      <section className='mt-6' id='g-bars'>
        <h2 className='eyebrow m-0 mb-2'>TopBar, Brand, Swatch, StatusBar</h2>
        <div className='overflow-hidden rounded-lg border border-line'>
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
        <div className='grid gap-2'>
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

      <section className='mt-6' id='g-review-skeleton'>
        <h2 className='eyebrow m-0 mb-2'>ReviewSkeleton</h2>
        <div className='flex h-[420px] overflow-hidden rounded-lg border border-line'>
          <ReviewSkeleton />
        </div>
      </section>

      <section className='mt-6' id='g-error-boundary'>
        <h2 className='eyebrow m-0 mb-2'>ErrorBoundary</h2>
        <div className='rounded-lg border border-line'>
          <CrashPanel
            what='the review'
            error={new TypeError("Cannot read properties of undefined (reading 'hunks')")}
          />
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
            className='h-4 rounded-xs bg-accent'
            style={{ width: `var(--space-${step})` }}
            data-tip={'--space-' + step}
          />
        ))}
      </Section>

      <Section id='g-color' title='Surfaces and colors'>
        {SURFACES.map((name) => (
          <span key={name} className='inline-flex items-center gap-2 font-mono text-xs text-muted'>
            <i className='size-6 rounded-sm border border-line-strong' style={{ background: `var(--${name})` }} />
            {name}
          </span>
        ))}
      </Section>

      <Section id='g-elevation' title='Elevation'>
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className='mr-4 mb-5 inline-grid h-[56px] w-[120px] place-items-center rounded-md border border-line-strong bg-raised text-xs text-muted'
            style={{ boxShadow: `var(--elev-${step})` }}
          >
            elev-{step}
          </span>
        ))}
      </Section>
    </main>
  );
}

/** A name to hover, as in the code: its card says what it is */
function HoverTarget() {
  const [anchor, setAnchor] = useState<HoverAnchor | null>(null);
  return (
    <>
      <code
        data-part='hover-target'
        className='rounded-xs font-mono text-code text-accent hover:bg-hover-bg'
        onPointerEnter={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setAnchor(null)}
      >
        findTsc
      </code>
      {anchor && (
        <HoverCard anchor={anchor}>
          <pre className='font-mono text-code whitespace-pre-wrap'>function findTsc(root: string): string | null</pre>
          <p>The repository&apos;s TypeScript 7, else lens&apos;s own.</p>
        </HoverCard>
      )}
    </>
  );
}
