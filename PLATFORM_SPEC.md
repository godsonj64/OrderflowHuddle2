# OrderFlow - Platform Specification & Business Use Cases

## 1. Executive Summary
**OrderFlow** is a modern, highly customizable digital menu and online ordering platform designed specifically for restaurants, cafes, food trucks, and ghost kitchens. It empowers culinary business owners to maintain a distinct, premium digital brand presence while offering customers a seamless, interactive, and visually engaging ordering experience.

## 2. Platform Architecture & Core Features

### 2.1 Customer-Facing Interface
*   **Immersive Visual Discovery**: 
    *   **Spotlight Reel**: A continuous, smooth-scrolling, borderless photo gallery that showcases high-quality photography of signature dishes, venue ambiance, or seasonal promotions.
    *   **Promotional Marquee**: Global scrolling text or image banners for announcing daily specials, happy hours, or important business updates (e.g., "Free delivery on orders over $30!").
*   **Interactive Menu Browsing**: Categorized menu navigation with visual item cards featuring iOS-style rounded corners and soft drop shadows.
*   **Rich Dish Details (Drawer UI)**: A fluid, mobile-native slide-up drawer provides deep dives into items, including customized imagery, preparation times, descriptions, and dynamic pricing.
*   **Advanced Modifiers & Add-ons**: Built-in support for required and optional modifier groups (e.g., size selection, extra toppings, dietary preferences), enabling customers to build complex orders exactly to their liking.
*   **Frictionless Cart System**: Real-time cart state management that tracks items, calculates complex modifier pricing precisely, and prepares the cart for checkout.

### 2.2 Admin & Management Dashboard
*   **Real-Time Branding Engine**: Business owners can upload and manage their visual identity without writing code. This includes Logo, Hero Banner, Promotional Marquee images, and Spotlight gallery content.
*   **Operational Management**: Admins can customize essential business data centrally, including complex business hours (e.g., split shifts, days off), contact lines, and location info.
*   **Catalog Customization**: Easily toggle sections (like the Spotlight feature) on or off to suit current marketing needs.

## 3. Business Use Cases

### 3.1 Direct-to-Consumer Quick Service & Takeout
*   **The Problem**: Third-party delivery and ordering aggregators often take 15-30% commissions, severely impacting restaurant profit margins.
*   **The OrderFlow Solution**: Acts as a white-labeled direct ordering storefront. Restaurants can link their OrderFlow site directly to their Instagram, Google Business Profile, and TikTok, driving direct sales where they retain complete margin control and customer data.

### 3.2 Premium QR-Code "Dine-In" Experiences
*   **The Problem**: Printing physical menus is expensive and they degrade over time. Static PDF menus viewed via QR code require excessive pinch-to-zoom and cannot process orders or highlight specials.
*   **The OrderFlow Solution**: Patrons scan a table-top QR code to load a stunning, mobile-optimized visual menu. The "Spotlight" and "Dish Details" features act as digital up-selling tools, tempting diners with high-resolution imagery and easy add-ons. 

### 3.3 Coffee Shops, BOBA & Highly Customized Venues
*   **The Problem**: High permutation of orders (e.g., "Large Iced Matcha Latte, Oat Milk, Less Ice, 2 Pumps Vanilla"). Standard eCommerce platforms struggle with complex variant pricing.
*   **The OrderFlow Solution**: The flexible Modifier System handles complex required/optional grouping seamlessly. It dynamically recalculates base pricing with additions (e.g., +$0.50 for Oat Milk, +$0.75 for extra boba), ensuring ticket accuracy for the barista and clear pricing for the customer.

### 3.4 Food Trucks & Transient Pop-ups
*   **The Problem**: Mobile food businesses change locations and menus frequently. They need a rapid way to broadcast their current status to followers.
*   **The OrderFlow Solution**: Owners can instantly update the Promo Marquee with their current street corner/event, toggle menu items based on current inventory, and present a professional brand face from a mobile device.

## 4. Technical Stack
*   **Framework**: React 18+ powered by Vite for rapid HMR and optimized production builds.
*   **Language**: TypeScript for strict type-safety across menus, modifiers, and cart states.
*   **Styling**: Tailwind CSS (Mobile-first, responsive design with advanced modern CSS features).
*   **Motion & Animation**: `motion/react` (Framer Motion) for fluid interactions (e.g., Marquee, Dish Drawers).
*   **Icons**: Lucide React.
*   **Data & State Management**: Custom Context APIs (CartContext) combined with optimized React Hooks.
