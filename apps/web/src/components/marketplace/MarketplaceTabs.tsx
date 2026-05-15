'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { SkillManifest, ServiceListing } from '@/lib/types';
import { Badge } from '@apogee/ui';
import { motion, AnimatePresence } from '@apogee/ui';
import { Zap, Server } from 'lucide-react';

type TabId = 'skills' | 'services';

interface Props {
  initialSkills: SkillManifest[];
  initialServices: ServiceListing[];
}

function fmtWei(wei: string): string {
  if (wei === '0') return 'Free';
  const eth = Number(BigInt(wei)) / 1e18;
  return `${eth.toFixed(8)} 0G/call`;
}

export function MarketplaceTabs({ initialSkills, initialServices }: Props) {
  const [tab, setTab] = useState<TabId>('skills');
  const [skillFilter, setSkillFilter] = useState('');
  const [serviceFilter, setServiceFilter] = useState('');

  const filteredSkills = initialSkills.filter(
    (s) =>
      s.name.toLowerCase().includes(skillFilter.toLowerCase()) ||
      s.description.toLowerCase().includes(skillFilter.toLowerCase()),
  );
  const filteredServices = initialServices.filter(
    (s) =>
      s.name.toLowerCase().includes(serviceFilter.toLowerCase()) ||
      s.description.toLowerCase().includes(serviceFilter.toLowerCase()),
  );

  return (
    <div className="space-y-6">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-line)]">
        {(['skills', 'services'] as TabId[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'flex items-center gap-2 py-3 px-5 text-sm transition-colors border-b-2 -mb-px capitalize',
              tab === t
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-fg-muted hover:text-fg',
            ].join(' ')}
          >
            {t === 'skills' ? <Zap className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
            {t}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'skills' && (
          <motion.div
            key="skills"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <input
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value)}
              placeholder="Search skills…"
              className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--color-line)] bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
            {filteredSkills.length === 0 ? (
              <p className="py-12 text-center text-sm text-fg-muted">No skills found.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredSkills.map((skill) => (
                  <SkillCard key={skill.id} skill={skill} />
                ))}
              </div>
            )}
          </motion.div>
        )}

        {tab === 'services' && (
          <motion.div
            key="services"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium text-fg">Protocol service endpoints</p>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-muted">
                  Core services powering agent identity, storage, compute, receipts, and settlement.
                </p>
              </div>
              <input
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                placeholder="Search services…"
                className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--color-line)] bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-faint focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            {filteredServices.length === 0 ? (
              <p className="py-12 text-center text-sm text-fg-muted">No services found.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredServices.map((svc) => (
                  <ServiceCard key={svc.id} service={svc} />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SkillCard({ skill }: { skill: SkillManifest }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-5 flex flex-col transition-[border-color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--color-line-accent)] hover:shadow-card hover:-translate-y-0.5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-medium text-sm text-fg">{skill.name}</p>
          <p className="mt-0.5 font-mono text-xs text-fg-faint">{skill.id}</p>
        </div>
        <Badge variant={skill.tier === 'premium' ? 'warning' : 'success'} className="capitalize shrink-0">
          {skill.tier}
        </Badge>
      </div>
      <p className="flex-1 text-xs text-fg-muted leading-relaxed">{skill.description}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-muted">{fmtWei(skill.pricePerCallWei)}</span>
        <Link
          href={`/agents/new?skill=${encodeURIComponent(skill.id)}`}
          className="rounded-[var(--radius)] bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent/20"
        >
          Add during deploy
        </Link>
      </div>
    </div>
  );
}

function ServiceCard({ service }: { service: ServiceListing }) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--color-line)] bg-surface p-5 transition-[border-color,box-shadow,transform] duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--color-line-accent)] hover:shadow-card hover:-translate-y-0.5">
      <p className="font-medium text-sm text-fg">{service.name}</p>
      <p className="mt-0.5 font-mono text-xs text-fg-faint">
        {service.providerAddress.slice(0, 6)}…{service.providerAddress.slice(-4)}
      </p>
      <p className="mt-2 text-xs text-fg-muted leading-relaxed">{service.description}</p>
      <div className="mt-4 flex items-center justify-between text-xs text-fg-muted">
        <span>{Number(BigInt(service.pricePerTokenWei)) / 1e18} 0G/token</span>
        {service.uptime != null && (
          <span className={service.uptime > 0.99 ? 'text-success' : 'text-warning'}>
            {(service.uptime * 100).toFixed(1)}% uptime
          </span>
        )}
      </div>
    </div>
  );
}
