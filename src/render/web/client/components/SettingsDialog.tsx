import { useLens } from '../store.ts';
import { catColor } from '../shared.ts';
import { ModalHead } from './ModalHead.tsx';

function CodeList({ items }: { items: readonly (string | number)[] | undefined }) {
  if (!items || items.length === 0) return <span className='set-source'>none</span>;
  return (
    <span className='set-list'>
      {items.map((item, itemIndex) => (
        <code key={itemIndex}>{String(item)}</code>
      ))}
    </span>
  );
}

function CategoryName({ category, disabled }: { category: string; disabled?: boolean }) {
  return (
    <span className={disabled ? 'set-cat set-off' : 'set-cat'}>
      <span className='dot' style={{ background: catColor(category) }} />
      {category}
    </span>
  );
}

/** The settings in effect: where they come from, this session's choices, every rule. */
export function SettingsDialog() {
  const { data, threshold, hideTests, hunksOnly } = useLens((state) => ({
    data: state.data,
    threshold: state.threshold,
    hideTests: state.hideTests,
    hunksOnly: state.hunksOnly,
  }));
  const config = data.config;
  const categories = Object.keys(config.categories || {});
  for (const pattern of config.callPatterns || []) {
    if (!categories.includes(pattern.category)) categories.push(pattern.category);
  }

  return (
    <dialog id='settings-modal'>
      <ModalHead title='settings' />
      <div className='modal-body' id='settings-body'>
        <div className='set-section'>
          <h3>config source</h3>
          <div className='set-source'>
            {data.configSource ? (
              <>
                built-in lens.defaults.json + <code>{data.configSource}</code>
              </>
            ) : (
              'built-in lens.defaults.json (no .lens.json found)'
            )}
          </div>
        </div>
        <div className='set-section'>
          <h3>this session</h3>
          <table className='set-table'>
            <tbody>
              <tr>
                <td>fold threshold</td>
                <td>
                  {(threshold < 0 ? 'off' : threshold) +
                    (threshold !== config.threshold ? ' (config: ' + config.threshold + ')' : '')}
                </td>
              </tr>
              <tr>
                <td>theme</td>
                <td>{data.theme}</td>
              </tr>
              <tr>
                <td>hide tests</td>
                <td>{hideTests ? 'on' : 'off'}</td>
              </tr>
              <tr>
                <td>hunks only</td>
                <td>{hunksOnly ? 'on' : 'off'}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className='set-section'>
          <h3>categories</h3>
          <table className='set-table'>
            <tbody>
              {categories.map((category) => {
                const enabled = (config.categories || {})[category] !== false;
                const score = (config.scores || {})[category] ?? 1;
                return (
                  <tr key={category}>
                    <td>
                      <CategoryName category={category} disabled={!enabled} />
                    </td>
                    <td>
                      {enabled
                        ? 'score ' + score + (score <= threshold ? ' — folds now' : ' — visible now')
                        : 'disabled'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className='set-section'>
          <h3>call patterns</h3>
          <table className='set-table'>
            <tbody>
              {(config.callPatterns || []).map((pattern, patternIndex) => (
                <tr key={patternIndex}>
                  <td>
                    <CategoryName category={pattern.category} />
                  </td>
                  <td>
                    <CodeList items={pattern.receivers} />
                    <br />
                    {pattern.methods ? (
                      <>
                        methods: <CodeList items={pattern.methods} />
                      </>
                    ) : (
                      'methods: any'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className='set-section'>
          <h3>keep visible</h3>
          markers: <CodeList items={config.keepCommentMarkers} />
          <br />
          directive: <CodeList items={[config.keepDirective]} />
        </div>
        <div className='set-section'>
          <h3>test file patterns</h3>
          <CodeList items={config.testFilePatterns} />
        </div>
        <div className='set-section'>
          <h3>excluded from analysis</h3>
          <CodeList items={config.exclude} />
        </div>
        <div className='set-note'>
          edit .lens.json and press ↻ refresh to apply changes without restarting — see the lens README for every field
        </div>
      </div>
    </dialog>
  );
}
