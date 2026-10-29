<script lang="ts">
	import {
		getLocalePreference,
		setLocalePreference,
		t as __gb_t,
		type LocalePreference,
	} from "@gitbutler/core/gb-i18n";
	import { CardGroup, Select, SelectItem } from "@gitbutler/ui-svelte";

	type LanguageOption = { label: string; value: LocalePreference };

	// Keep the autonyms in the script so the i18n preprocessor leaves them alone.
	const options: LanguageOption[] = [
		{ label: __gb_t("System default"), value: "system" },
		{ label: "English", value: "en" },
		{ label: "简体中文", value: "zh-CN" },
	];

	const current = getLocalePreference();

	function onSelect(value: string) {
		if (value === current) return;
		setLocalePreference(value as LocalePreference);
	}
</script>

<CardGroup>
	<CardGroup.Item alignment="center">
		{#snippet title()}
			{__gb_t("Language")}
		{/snippet}

		{#snippet caption()}
			{__gb_t("Choose the language used by the interface. The app reloads after switching.")}
		{/snippet}

		{#snippet actions()}
			<Select value={current} {options} onselect={onSelect}>
				{#snippet itemSnippet({ item, highlighted })}
					<SelectItem selected={item.value === current} {highlighted}>
						{item.label}
					</SelectItem>
				{/snippet}
			</Select>
		{/snippet}
	</CardGroup.Item>
</CardGroup>
