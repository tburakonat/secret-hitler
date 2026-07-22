import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';

interface RulesModalProps {
  onClose: () => void;
}

type SectionKey = 'overview' | 'roundStructure' | 'executiveActions' | 'winConditions';

const SECTION_KEYS: SectionKey[] = ['overview', 'roundStructure', 'executiveActions', 'winConditions'];

export function RulesModal({ onClose }: RulesModalProps) {
  const { t } = useTranslation();
  const [openSection, setOpenSection] = useState<SectionKey>('overview');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-gray-700 bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-700/60 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            {t('rules.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.cancel')}
            className="text-lg leading-none text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-2">
          {SECTION_KEYS.map((key) => (
            <RulesSection
              key={key}
              sectionKey={key}
              isOpen={openSection === key}
              onToggle={() => setOpenSection(openSection === key ? ('' as SectionKey) : key)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RulesSection({
  sectionKey,
  isOpen,
  onToggle,
}: {
  sectionKey: SectionKey;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const base = `rules.sections.${sectionKey}`;

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-white hover:text-gray-200"
      >
        {t(`${base}.title`)}
        <span className={clsx('text-gray-500 transition-transform', isOpen && 'rotate-180')}>▾</span>
      </button>

      {isOpen && (
        <div className="space-y-3 px-3 pb-4 text-sm text-gray-300">
          {sectionKey === 'overview' && <OverviewContent />}
          {sectionKey === 'roundStructure' && <RoundStructureContent />}
          {sectionKey === 'executiveActions' && <ExecutiveActionsContent />}
          {sectionKey === 'winConditions' && <WinConditionsContent />}
        </div>
      )}
    </div>
  );
}

function OverviewContent() {
  const { t } = useTranslation();
  const headers = t('rules.sections.overview.tableHeaders', { returnObjects: true }) as string[];
  const rows = t('rules.sections.overview.tableRows', { returnObjects: true }) as string[][];

  return (
    <>
      <p>{t('rules.sections.overview.intro')}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              {headers.map((h) => (
                <th key={h} className="border-b border-gray-700 py-1 pr-2 text-left font-semibold text-gray-400">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j} className="border-b border-gray-800 py-1 pr-2">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">{t('rules.sections.overview.note')}</p>
      <p>{t('rules.sections.overview.deck')}</p>
    </>
  );
}

function RoundStructureContent() {
  const { t } = useTranslation();
  const steps = t('rules.sections.roundStructure.steps', { returnObjects: true }) as {
    heading: string;
    body: string;
  }[];

  return (
    <>
      {steps.map((step) => (
        <div key={step.heading}>
          <h3 className="font-semibold text-white">{step.heading}</h3>
          <p>{step.body}</p>
        </div>
      ))}
    </>
  );
}

function ExecutiveActionsContent() {
  const { t } = useTranslation();
  const actions = t('rules.sections.executiveActions.actions', { returnObjects: true }) as {
    name: string;
    body: string;
  }[];

  return (
    <>
      <p>{t('rules.sections.executiveActions.intro')}</p>
      {actions.map((action) => (
        <div key={action.name}>
          <h3 className="font-semibold text-white">{action.name}</h3>
          <p>{action.body}</p>
        </div>
      ))}
    </>
  );
}

function WinConditionsContent() {
  const { t } = useTranslation();
  const liberals = t('rules.sections.winConditions.liberals', { returnObjects: true }) as string[];
  const fascists = t('rules.sections.winConditions.fascists', { returnObjects: true }) as string[];

  return (
    <>
      <div>
        <h3 className="font-semibold text-white">{t('rules.sections.winConditions.liberalsTitle')}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {liberals.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-semibold text-white">{t('rules.sections.winConditions.fascistsTitle')}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {fascists.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </>
  );
}
