import mongoose, { Schema, Document } from 'mongoose';

export type BannerType = 'GREETING' | 'PROMOTIONAL';
export type FestivalType = 'DIWALI' | 'HOLI' | 'NEW_YEAR' | 'CHRISTMAS' | 'EID' | 'INDEPENDENCE_DAY' | 'REPUBLIC_DAY' | 'CUSTOM';
export type BgThemeType = 'DIWALI_GOLD' | 'HOLI_COLORS' | 'NEW_YEAR_MIDNIGHT' | 'CHRISTMAS_RED' | 'EID_EMERALD' | 'TRICOLOR_INDIA' | 'ROYAL_PURPLE' | 'SUNSET_ORANGE' | 'CUSTOM';

export interface IFestiveBanner extends Document {
  title: string;
  subtitle: string;
  bannerType: BannerType;
  festival: FestivalType;
  badgeText?: string;
  promoCode?: string;
  discountText?: string;
  ctaText?: string;
  ctaLink?: string;
  imageUrl?: string;
  bgTheme: BgThemeType;
  customBgGradient?: string;
  isActive: boolean;
  showTopStrip: boolean;
  startDate?: Date;
  endDate?: Date;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

const festiveBannerSchema = new Schema<IFestiveBanner>(
  {
    title: { type: String, required: true, trim: true },
    subtitle: { type: String, required: true, trim: true },
    bannerType: { type: String, enum: ['GREETING', 'PROMOTIONAL'], default: 'GREETING' },
    festival: { 
      type: String, 
      enum: ['DIWALI', 'HOLI', 'NEW_YEAR', 'CHRISTMAS', 'EID', 'INDEPENDENCE_DAY', 'REPUBLIC_DAY', 'CUSTOM'], 
      default: 'DIWALI' 
    },
    badgeText: { type: String, trim: true, default: '' },
    promoCode: { type: String, trim: true, uppercase: true, default: '' },
    discountText: { type: String, trim: true, default: '' },
    ctaText: { type: String, trim: true, default: 'Explore Flights' },
    ctaLink: { type: String, trim: true, default: '/' },
    imageUrl: { type: String, trim: true, default: '' },
    bgTheme: { 
      type: String, 
      enum: ['DIWALI_GOLD', 'HOLI_COLORS', 'NEW_YEAR_MIDNIGHT', 'CHRISTMAS_RED', 'EID_EMERALD', 'TRICOLOR_INDIA', 'ROYAL_PURPLE', 'SUNSET_ORANGE', 'CUSTOM'],
      default: 'DIWALI_GOLD' 
    },
    customBgGradient: { type: String, default: '' },
    isActive: { type: Boolean, default: true, index: true },
    showTopStrip: { type: Boolean, default: true },
    startDate: { type: Date },
    endDate: { type: Date },
    priority: { type: Number, default: 1 }
  },
  { timestamps: true }
);

festiveBannerSchema.index({ isActive: 1, priority: -1, createdAt: -1 });

const FestiveBanner = mongoose.model<IFestiveBanner>('FestiveBanner', festiveBannerSchema);
export default FestiveBanner;
