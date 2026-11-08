-- Two more banner places for the promotions slider: the middle of the home page and the top of the promotions page.
alter table banners drop constraint banners_placement_check;
alter table banners add constraint banners_placement_check
  check (placement in ('home_hero', 'casino_hero', 'live_casino_hero', 'sports_hero', 'home_promo', 'promotions_hero'));
