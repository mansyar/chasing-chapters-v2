import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from "@payloadcms/next/rsc";
import {
	AlignFeatureClient as AlignFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	BlockquoteFeatureClient as BlockquoteFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	BoldFeatureClient as BoldFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	ChecklistFeatureClient as ChecklistFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	HeadingFeatureClient as HeadingFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	HorizontalRuleFeatureClient as HorizontalRuleFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	IndentFeatureClient as IndentFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	InlineCodeFeatureClient as InlineCodeFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	InlineToolbarFeatureClient as InlineToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	ItalicFeatureClient as ItalicFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	LinkFeatureClient as LinkFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	OrderedListFeatureClient as OrderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	ParagraphFeatureClient as ParagraphFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	RelationshipFeatureClient as RelationshipFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	StrikethroughFeatureClient as StrikethroughFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	SubscriptFeatureClient as SubscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	SuperscriptFeatureClient as SuperscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	UnderlineFeatureClient as UnderlineFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	UnorderedListFeatureClient as UnorderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	UploadFeatureClient as UploadFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
} from "@payloadcms/richtext-lexical/client";
import {
	LexicalDiffComponent as LexicalDiffComponent_44fe37237e0ebf4470c9990d8cb7b07e,
	RscEntryLexicalCell as RscEntryLexicalCell_44fe37237e0ebf4470c9990d8cb7b07e,
	RscEntryLexicalField as RscEntryLexicalField_44fe37237e0ebf4470c9990d8cb7b07e,
} from "@payloadcms/richtext-lexical/rsc";
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from "@payloadcms/storage-s3/client";
import { AdminLogin as AdminLogin_fa00c180b3f657f6de380c1d2896c16a } from "@/components/AdminLogin";
import { AdminStyleProvider as AdminStyleProvider_28a320d35397731301b152c32111b42a } from "@/components/AdminStyleProvider";
import { AnalyticsDashboard as AnalyticsDashboard_d8816c4bca290ed5b5596bb3533c3751 } from "@/components/admin/AnalyticsDashboard";
import { BulkRetranslateAction as BulkRetranslateAction_708c1e8afd07e71504f16fd3ad23a526 } from "@/components/admin/BulkRetranslateAction";
import { TranslationAttentionBell as TranslationAttentionBell_4614064c5a55676044bf5957b5262af2 } from "@/components/admin/TranslationAttentionBell";
import { RetranslateButton as RetranslateButton_8e2b4cee1966104759db58c9db42cd22 } from "../../../collections/Reviews/admin/RetranslateButton";

/** @type import('payload').ImportMap */
export const importMap = {
	"@payloadcms/richtext-lexical/rsc#RscEntryLexicalCell":
		RscEntryLexicalCell_44fe37237e0ebf4470c9990d8cb7b07e,
	"@payloadcms/richtext-lexical/rsc#RscEntryLexicalField":
		RscEntryLexicalField_44fe37237e0ebf4470c9990d8cb7b07e,
	"@payloadcms/richtext-lexical/rsc#LexicalDiffComponent":
		LexicalDiffComponent_44fe37237e0ebf4470c9990d8cb7b07e,
	"@payloadcms/richtext-lexical/client#InlineToolbarFeatureClient":
		InlineToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#HorizontalRuleFeatureClient":
		HorizontalRuleFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#UploadFeatureClient":
		UploadFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#BlockquoteFeatureClient":
		BlockquoteFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#RelationshipFeatureClient":
		RelationshipFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#LinkFeatureClient":
		LinkFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#ChecklistFeatureClient":
		ChecklistFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#OrderedListFeatureClient":
		OrderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#UnorderedListFeatureClient":
		UnorderedListFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#IndentFeatureClient":
		IndentFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#AlignFeatureClient":
		AlignFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#HeadingFeatureClient":
		HeadingFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#ParagraphFeatureClient":
		ParagraphFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#InlineCodeFeatureClient":
		InlineCodeFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#SuperscriptFeatureClient":
		SuperscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#SubscriptFeatureClient":
		SubscriptFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#StrikethroughFeatureClient":
		StrikethroughFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#UnderlineFeatureClient":
		UnderlineFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#BoldFeatureClient":
		BoldFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"@payloadcms/richtext-lexical/client#ItalicFeatureClient":
		ItalicFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
	"/collections/Reviews/admin/RetranslateButton#RetranslateButton":
		RetranslateButton_8e2b4cee1966104759db58c9db42cd22,
	"@/components/admin/TranslationAttentionBell#TranslationAttentionBell":
		TranslationAttentionBell_4614064c5a55676044bf5957b5262af2,
	"@/components/admin/BulkRetranslateAction#BulkRetranslateAction":
		BulkRetranslateAction_708c1e8afd07e71504f16fd3ad23a526,
	"@/components/AdminStyleProvider#AdminStyleProvider":
		AdminStyleProvider_28a320d35397731301b152c32111b42a,
	"@/components/AdminLogin#AdminLogin":
		AdminLogin_fa00c180b3f657f6de380c1d2896c16a,
	"@/components/admin/AnalyticsDashboard#AnalyticsDashboard":
		AnalyticsDashboard_d8816c4bca290ed5b5596bb3533c3751,
	"@payloadcms/next/rsc#CollectionCards":
		CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1,
	"@payloadcms/storage-s3/client#S3ClientUploadHandler":
		S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24,
};
