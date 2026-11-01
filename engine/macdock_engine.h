#ifndef MACDOCK_ENGINE_H
#define MACDOCK_ENGINE_H

#include <glib.h>
#include <stdbool.h>
#include <stdint.h>

G_BEGIN_DECLS

guintptr macdock_engine_create(guint32 count);
void macdock_engine_destroy(guintptr engine);
void macdock_engine_set_config(guintptr engine, gdouble base_size, gdouble max_scale, gdouble radius, gdouble spacing);
void macdock_engine_set_icon_count(guintptr engine, guint32 count);
void macdock_engine_update_pointer(guintptr engine, gdouble mouse_x, gboolean inside);
void macdock_engine_update_pointer_proximity(guintptr engine, gdouble mouse_x, gdouble proximity);
void macdock_engine_trigger_bounce(guintptr engine, guint32 index, gdouble initial_velocity, guint32 max_bounces);
gboolean macdock_engine_is_animating(guintptr engine);
void macdock_engine_step(guintptr engine, gdouble dt);
gdouble macdock_engine_get_dock_width(guintptr engine);
gdouble macdock_engine_get_icon_x(guintptr engine, guint32 index);
gdouble macdock_engine_get_icon_y(guintptr engine, guint32 index);
gdouble macdock_engine_get_icon_scale_x(guintptr engine, guint32 index);
gdouble macdock_engine_get_icon_scale_y(guintptr engine, guint32 index);
gboolean macdock_engine_feed_edge_motion(guintptr engine, gdouble velocity, gdouble dt);

G_END_DECLS

#endif
