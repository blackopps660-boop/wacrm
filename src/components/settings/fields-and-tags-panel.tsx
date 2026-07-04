'use client';

import { useCan } from '@/hooks/use-can';

import { CustomFieldsSettings } from './custom-fields-settings';
import { LifecycleStageManager } from './lifecycle-stage-manager';
import { SettingsPanelHead } from './settings-panel-head';
import { TagManager } from './tag-manager';

/**
 * "Fields & tags" section — merges the former Tags and Custom Fields
 * tabs, plus Lifecycle stages. Tags are visible to everyone; the
 * custom-fields catalogue is account-wide config, so the card is
 * admin-gated (mirroring the old hidden-tab behaviour). `custom_fields`
 * RLS rejects non-admin writes regardless. Lifecycle stages are
 * readable by everyone (LifecycleStageManager itself disables editing
 * for non-admins) since agents still need to see the current stages
 * to understand the list.
 */
export function FieldsAndTagsPanel() {
  const canEditSettings = useCan('edit-settings');

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title="Fields & tags"
        description="Three ways to organize contacts: lifecycle stages for where they stand, colour-coded tags for quick grouping, and custom fields for structured data."
      />
      <LifecycleStageManager />
      <TagManager />
      {canEditSettings ? <CustomFieldsSettings /> : null}
    </section>
  );
}
