// web/components/SwipeCarousel.tsx
import * as React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination } from "swiper/modules";

// Swiper core styles
import "swiper/css";
import "swiper/css/pagination";

type SwipeCarouselProps = {
  items: React.ReactNode[];
  className?: string;
};

export default function SwipeCarousel({
  items,
  className,
}: SwipeCarouselProps) {
  if (!items || items.length === 0) return null;

  return (
    <Swiper
      pagination={{
        clickable: true,
        dynamicBullets: true,
      }}
      modules={[Pagination]}
      className={className}
      spaceBetween={16}
    >
      {items.map((child, idx) => (
        <SwiperSlide key={idx}>
          {/* Ensure slide content stretches nicely */}
          <div className="w-full">{child}</div>
        </SwiperSlide>
      ))}
    </Swiper>
  );
}
