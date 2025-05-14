/**
 * Spanish localization for Trackmania Campaign Records Bot
 */
export default {
    // Command descriptions
    commands: {
        register: 'Registra tu cuenta de Trackmania para el seguimiento de récords',
        registerOption: 'Tu ID de cuenta de Trackmania (se obtiene de trackmania.io)',
        unregister: 'Cancela el registro del sistema de seguimiento de récords',
        records: 'Ver tus récords recientes',
        leaderboard: 'Ver la tabla de clasificación',
        leaderboardOption: 'Opcional: filtrar por nombre de mapa',
        help: 'Muestra los comandos disponibles y cómo usarlos',
        language: 'Cambiar el idioma del bot (admin/mod solamente)',
        languageOption: 'Idioma a usar',
        setcountry: 'Establecer el país predeterminado para la tabla de clasificación (solo admin/mod)',
        setcountryOption: 'País a usar como predeterminado',
        leaderboardCountryOption: 'Seleccionar un país para la tabla de clasificación',
        setchannel: 'Establecer el canal para los anuncios de récords',
        setchannelOption: 'El canal donde se enviarán los anuncios de récords',
        setweeklyshortschannel: 'Establecer el canal para anuncios de weekly shorts',
        setweeklyshortschannelOption: 'El canal donde se enviarán los anuncios de weekly shorts',
        weeklyshortsleaderboard: 'Mostrar la tabla de clasificación de weekly shorts',
        weeklyshortsleaderboardOption: 'Opcional: filtrar por nombre de mapa',
        weeklyshortsleaderboardCountryOption: 'Seleccionar un país',
        setminposition: 'Establecer la posición mundial mínima para anunciar récords',
        setminpositionOption: 'Posición mundial mínima (ej. 5000)'
    },

    // Command responses
    responses: {
        register: {
            success: '✅ ¡Has sido registrado/a para el seguimiento de récords de Trackmania!',
            updated: '✅ ¡Tu cuenta de Trackmania ha sido actualizada!',
            failed: '❌ Registro fallido: {error}'
        },
        unregister: {
            success: '✅ Tu registro del sistema de seguimiento de récords de Trackmania ha sido cancelado.',
            failed: '❌ Cancelación de registro fallida: {error}'
        },
        records: {
            notRegistered: 'No estás registrado/a. Usa `/register` para registrar tu cuenta de Trackmania.',
            noRecords: "Aún no tienes récords.",
            error: '❌ Ocurrió un error al obtener tus récords.'
        },
        leaderboard: {
            noRecordsMap: 'No se encontraron récords para mapas que coincidan con "{mapName}".',
            noRecords: 'No se encontraron récords en la base de datos.',
            noCountryRecords: 'No se encontraron récords de {country} para {mapName}.',
            noSeasonRecords: 'No se encontraron jugadores de {country} en la tabla de clasificación de la campaña actual.',
            error: '❌ Ocurrió un error al obtener la tabla de clasificación.',
            fetchingMaps: '🔄 Obteniendo mapas de la campaña actual...',
            errorFetchingMaps: '❌ Error al obtener mapas de la API. Por favor, inténtalo de nuevo más tarde.',
            loadingSeason: '🔄 Cargando ranking de la campaña actual...'
        },
        language: {
            changed: '✅ El idioma ha sido cambiado a Español.',
            error: '❌ Ocurrió un error al cambiar el idioma.',
            noPermission: '❌ Necesitas permisos de administrador o moderador para cambiar el idioma del bot.'
        },
        setcountry: {
            changed: '✅ El país predeterminado ha sido establecido a {country}.',
            error: '❌ Ocurrió un error al establecer el país predeterminado.',
            noPermission: '❌ Necesitas permisos de administrador o moderador para cambiar el país predeterminado.'
        },
        setchannel: {
            noPermission: '❌ Necesitas permisos de administrador o moderador para usar este comando.',
            changed: '✅ Los anuncios de récords ahora se enviarán a {channel}',
            error: '❌ No se pudo establecer el canal de anuncios.',
            notText: '❌ El canal seleccionado debe ser un canal de texto.'
        },
        setweeklyshortschannel: {
            noPermission: '❌ Necesitas permisos de administrador o moderador para usar este comando.',
            changed: '✅ Los anuncios de weekly shorts ahora se enviarán a {channel}',
            error: '❌ No se pudo establecer el canal de anuncios de weekly shorts.',
            notText: '❌ El canal seleccionado debe ser un canal de texto.'
        },
        weeklyshortsleaderboard: {
            error: '❌ Ocurrió un error al obtener la tabla de clasificación de weekly shorts.',
            noSeasonRecords: 'No se encontraron jugadores de {country} en los weekly shorts actuales.',
            noRecordsMap: 'No se encontró ningún mapa de weekly shorts que coincida con "{mapName}".',
            noCountryRecords: 'No se encontraron récords de {country} en {mapName}.'
        },
        setminposition: {
            noPermission: '❌ Necesitas permisos de administrador o moderador para usar este comando.',
            changed: '✅ Los récords ahora solo se anunciarán para posiciones mundiales dentro del top {position}',
            error: '❌ No se pudo establecer la posición mundial mínima.'
        },
        error: {
            unknown: 'Ocurrió un error al procesar este comando.',
            unknownCommand: 'Comando desconocido.'
        }
    },

    // Embed titles and fields
    embeds: {
        records: {
            title: '🏆 Récords Recientes: {username}',
            description: 'Tus {count} récords más recientes:',
            time: '⏱️ Tiempo',
            setOn: '📅 Establecido el',
        },
        countryLeaderboard: {
            title: '🏆 Clasificación {country}: {mapName}',
            description: 'Top {count} récords de {country} para este mapa:',
            time: '⏱️ Tiempo',
            position: '🏁 Posición',
            worldwide: 'mundial',
            noRecords: 'Sin Récords de {country}',
            noRecordsDesc: 'No se encontraron récords de jugadores de {country} en este mapa.'
        },
        seasonLeaderboard: {
            title: '🏆 Clasificación {country} de campaña: {season}',
            description: 'Top {count} jugadores/as de {country} en la campaña actual:',
            points: '🔸 Puntos',
            position: '🏁 Posición',
            worldwide: 'mundial',
            noRecords: 'Sin Récords de {country}',
            noRecordsDesc: 'No se encontraron récords de jugadores/as de {country} en esta campaña.'
        },
        help: {
            title: '❓ Trackmania Record Tracker - Ayuda',
            description: 'Aquí están los comandos disponibles:',
            register: '🔑 /register [id-cuenta]',
            registerDesc: 'Registra tu cuenta de Trackmania para el seguimiento de récords',
            unregister: '🚫 /unregister',
            unregisterDesc: 'Cancela el registro del sistema de seguimiento de récords',
            records: '🏁 /records',
            recordsDesc: 'Ver tus récords recientes',
            leaderboard: '🏆 /leaderboard [mapa]',
            leaderboardDesc: 'Ver la tabla de clasificación de país (muestra campaña actual o mapa específico)',
            help: '❓ /help',
            helpDesc: 'Muestra este mensaje de ayuda',
            language: '🌐 /language',
            languageDesc: 'Cambiar el idioma del bot (admin/mod solamente)',
            setcountry: '🇺🇳 /setcountry',
            setcountryDesc: 'Establecer el país predeterminado para la tabla de clasificación (solo admin/mod)',
            setchannel: '📣 /setchannel',
            setchannelDesc: 'Establecer el canal para los anuncios de récords (solo admin/mod)',
            weeklyshortsleaderboard: '🏆 /weeklyshortsleaderboard',
            weeklyshortsleaderboardDesc: 'Mostrar la tabla de clasificación de weekly shorts (general o por mapa)',
            setweeklyshortschannel: '📢 /setweeklyshortschannel',
            setweeklyshortschannelDesc: 'Establecer el canal para anuncios de weekly shorts (solo admin/mod)',
            setminposition: '🎯 /setminposition',
            setminpositionDesc: 'Establecer posición mundial mínima para anunciar récords (solo admin/mod)',
            footer: 'Los récords se verifican automáticamente'
        },
        newRecord: {
            title: '{emoji} ¡Nuevo PB!',
            description: '**{username}** (<@{discordId}>) acaba de establecer {recordType}!',
            firstRecord: 'su primer récord',
            newPersonalBest: 'un nuevo récord personal',
            map: '🗺️ Mapa',
            time: '⏱️ Tiempo',
            worldPosition: '🌍 Posición Mundial',
            previous: '⏮️ Anterior',
            footer: 'Récord establecido el {date} a las {time}'
        }
    },

    values: {
        none: 'Ninguno'
    }
};